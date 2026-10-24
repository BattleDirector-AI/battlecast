// Dev-only sanity check for the live race simulator.
//
// Run:  npm run validate-simulator   (from producers/mock/)
//
// Steps simulate.js forward a few thousand ticks and validates every resulting
// snapshot against the same required-field contract used for the static
// fixtures (validate.js). Because the simulator auto-cycles through the session
// phases (qualifying → grid → race → results), a long enough run visits every
// phase; this check additionally asserts that (a) every one of those phases was
// actually observed and validated, and (b) qualifying produced at least one
// `notable.class_best_lap` flag, so the class-best edge the #22 widget relies on
// is exercised. Exits non-zero on any failure.

const { createSimulator, mulberry32, PHASES, classPace } = require("./simulate.js");
const { validate } = require("./validate.js");

// Lap-time realism band, as a fraction of a class's base pace. A completed lap far
// below the class pace means a car is out-lapping its own class (the absolute-noise
// bug: slower classes posting sub-pace laps); far above means an inflated multi-lap
// "out lap". Per-car skill offset (±0.5s) plus the ±4% pace noise keep real laps
// comfortably inside [0.9x, 1.5x]; the pre-fix code produced laps down to ~0.55x.
// The run is seeded (VALIDATE_SEED below), but the 0.9x floor keeps a deliberate ~0.05
// margin over the observed worst legitimate lap (~0.95x), so the check also holds for other
// seeds; tightening the band or widening the noise clamp would erode that margin.
const LAP_MIN_FACTOR = 0.9;
const LAP_MAX_FACTOR = 1.5;

const TICKS = Number(process.env.VALIDATE_TICKS) || 3000;
// Every random draw in the simulator goes through a PRNG seeded here, and the run key is fixed,
// so the run is identical every time (#346). VALIDATE_SEED tries another seed.
const SEED = Number(process.env.VALIDATE_SEED) || 346;
const DT_SECONDS = Number(process.env.SIM_DT_SECONDS) || 2;

// Drive the phase machine with short, explicit durations (independent of any
// QUALI_SECONDS/... env a tester may have set) so a bounded run is guaranteed to
// cycle through every phase several times. Qualifying stays long enough for cars
// to complete flying laps and set class bests.
const simulator = createSimulator({
  phaseSeconds: { qualifying: 400, grid: 40, race: 400, results: 40 },
  rng: mulberry32(SEED),
  runKey: `seed${SEED}`,
});

let failed = 0;
const ticksByMode = new Map();
let qualiClassBestSeen = false;
const lapBandViolations = [];
// last_lap persists for the ~50 ticks between a car's laps, so dedup per
// (car, lap) to keep the report from filling with copies of one bad lap.
const seenLapKeys = new Set();
// Lap-deficit fields (ADR 0012): the race phase must lap at least one backmarker, carry
// the three laps_behind_* fields as integers >= 0, and never send a lapped car's
// gap_to_leader as a 0 placeholder.
let lappedSeen = false;
const lapFieldViolations = [];
// Starting grid realism (#217): a real grid packs 14 cars into ~100 m of a ~5 km lap, so at
// the green flag the whole field sits within a couple of seconds of the leader, and nobody
// can be a lap down during the opening lap.
const START_SPREAD_MAX_SECONDS = 2.5;
const OPENING_LAP_SECONDS = 60;
let raceTicks = 0;
let prevMode = null;
const gridViolations = [];
const isLapCount = (n) => Number.isInteger(n) && n >= 0;
// Local-yellow fields (ADR 0016). This is the mock producer's own output policy, stricter than
// the contract (which allows any sector count, absent values, and involvement without sector
// flags): every race tick carries `session.sector_flags` (three strings) and a boolean
// `yellow_involved` on every car; a car is involved only while some sector is yellow or the
// course is under FCY; and the race stages at least one local yellow
// (a yellow sector outside FCY) with an involved car, so both overlay paths run live.
let localYellowSeen = false;
const yellowViolations = [];
// Finish status (ADR 0017), the mock producer's own output policy: every race and results tick
// carries an integer `finish_status` in 0..3 on every car, and other phases omit it. In the race a
// car reads 1 only once the session flag is `checkered`, and once a car's code is non-zero it
// never changes again within one race leg. The race must show the flag falling progressively, with a tick where some
// cars have finished while others are still running, and retire at least one car (2). In results
// every car is classified: 1, 2 or 3, never 0.
let progressiveFinishSeen = false;
let dnfSeen = false;
const finishViolations = [];
// Single-class flag (ADR 0022): see the per-tick check at the top of the loop.
const multiclassViolations = [];
let multiclassViolationCount = 0;
// The director (#237): in the race, the subject is never a retired car, nor a finished one while
// any car is still running. Guarded by seeing a race tick with a retiree and a part-finished field.
const directorViolations = [];
let directorMixSeen = false;
function directorProblems(payload) {
  const anyRunning = payload.vehicles.some((v) => v.finish_status === 0);
  const subject = payload.vehicles.find((v) => v.slot_id === payload.subject?.slot_id);
  if (!subject) return [`subject ${payload.subject?.slot_id} is not in vehicles[]`];
  const problems = [];
  if (subject.finish_status === 2) problems.push(`subject ${subject.driver_name} is retired`);
  if (subject.finish_status === 1 && anyRunning) problems.push(`subject ${subject.driver_name} is finished`);
  // The gaps are to the cars directly ahead/behind in running order, which the battle box
  // names, so each is present exactly when that neighbour exists.
  const last = payload.vehicles.length;
  const gaps = payload.relationship ?? {};
  if ((gaps.gap_ahead != null) !== (subject.position > 1)) problems.push(`gap_ahead=${gaps.gap_ahead} at P${subject.position}`);
  if ((gaps.gap_behind != null) !== (subject.position < last)) problems.push(`gap_behind=${gaps.gap_behind} at P${subject.position} of ${last}`);
  return problems;
}
let finishPrev = new Map();
// Per race leg (#236): the tick each car turned 1 (finish order), each retired car's last_lap
// when it turned 2 (a retired car stops, so it never completes another lap), whether anyone has
// finished yet, and the previous race tick (to see results classify cars still running).
let finishTick = new Map();
let retiredLap = new Map();
let anyFinished = false;
let lastRaceTick = null;
let resultsClassifiedSeen = false;
const isFinishCode = (n) => Number.isInteger(n) && n >= 0 && n <= 3;
// Race events (ADR 0023), the mock producer's own output policy (each entry's shape is checked by
// validate.js): every tick carries a `race_events` array of at most 20; every id shares one run key
// prefix; an id's entry never changes while listed; an id that leaves the list was listed for at
// least 30 s and never comes back; an overall fastest lap is not also sent as a class event; and
// the run announces all four types.
// No bursts at the race start (#346): nothing is announced in a race leg's first
// RACE_START_QUIET_SECONDS (the opening-lap shuffle and the standing-start lap are not news), two
// leader changes are never announced within LEADER_CHANGE_MIN_GAP_SECONDS of each other (simulate.js
// LEADER_HOLD_SECONDS) in one race leg, and a class fastest lap is announced only once its class
// has a best set after the opening lap: some other lap in the class, completed on a car's second
// lap or later, beat the class best before it and is slower than the announced lap. Laps are
// counted per car from the `last_lap` changes in the leg. Overall fastest laps from a car's
// second lap on are not part of this guard, by design (#346 named class laps only).
const RACE_EVENT_MIN_LISTED_SECONDS = 30;
const RACE_START_QUIET_SECONDS = 60;
const LEADER_CHANGE_MIN_GAP_SECONDS = 10;
let lastLeaderChangeTick = null;
let legLapCount = new Map(); // slot_id -> laps completed this leg
let legLastLap = new Map(); // slot_id -> last_lap last seen
let legClassMin = new Map(); // vehicle_class -> fastest lap completed this leg
let legClassRecords = new Map(); // vehicle_class -> [{ slot_id, lap }] post-opening laps that beat the class best
const raceEventViolations = [];
const raceEventFirstTick = new Map(); // id -> tick first listed
const raceEventBody = new Map(); // id -> JSON of its entry
const raceEventGone = new Set();
const raceEventTypesSeen = new Set();
let raceEventRunKey = null;
let raceEventPrevIds = new Set();
// Event metadata and info lines (ADR 0024), the mock's own output policy (shape is checked by
// validate.js): every tick carries an `event` with a non-blank name and track and an integer
// round >= 1 that never goes down, and a non-empty `info_lines` of distinct non-blank strings;
// across the run the round advances (a loop back to qualifying) and the line list changes, so
// the info panel's header and its changed-list path are both exercised live.
const eventInfoViolations = [];
let lastEventRound = null;
let eventRoundAdvanced = false;
const infoLineListsSeen = new Set();
const nonBlankString = (v) => typeof v === "string" && v.trim() !== "";

for (let i = 0; i < TICKS; i++) {
  const payload = simulator.step(DT_SECONDS);
  {
    const ev = payload.event;
    const lines = payload.info_lines;
    const problems = [];
    if (!ev || !nonBlankString(ev.name) || !nonBlankString(ev.track) || !(Number.isInteger(ev.round) && ev.round >= 1)) {
      problems.push(`event=${JSON.stringify(ev)}`);
    } else {
      if (lastEventRound != null && ev.round < lastEventRound) problems.push(`round went back ${lastEventRound} -> ${ev.round}`);
      if (lastEventRound != null && ev.round > lastEventRound) eventRoundAdvanced = true;
      lastEventRound = ev.round;
    }
    if (!Array.isArray(lines) || lines.length === 0 || !lines.every(nonBlankString) || new Set(lines).size !== lines.length) {
      problems.push(`info_lines=${JSON.stringify(lines)}`);
    } else {
      infoLineListsSeen.add(JSON.stringify(lines));
    }
    if (problems.length > 0 && eventInfoViolations.length < 10) {
      eventInfoViolations.push(`tick ${i} (${payload.mode}): ${problems.join(", ")}`);
    }
  }
  ticksByMode.set(payload.mode, (ticksByMode.get(payload.mode) || 0) + 1);
  // Single-class flag (protocol-contract rule 20, ADR 0022): every tick, in every phase, carries
  // a boolean `session.multiclass` that matches the class mix the mock is actually running:
  // true exactly when its field holds more than one distinct `vehicle_class`.
  {
    const classCount = new Set(payload.vehicles.map((v) => v.vehicle_class)).size;
    const flag = payload.session?.multiclass;
    let problem = null;
    if (typeof flag !== "boolean") problem = `session.multiclass=${JSON.stringify(flag)}`;
    else if (flag !== classCount > 1) problem = `multiclass=${flag} with ${classCount} class(es)`;
    if (problem) {
      multiclassViolationCount += 1;
      if (multiclassViolations.length < 5) multiclassViolations.push(`tick ${i} (${payload.mode}): ${problem}`);
    }
  }
  if (payload.mode === "qualifying" && payload.vehicles.some((v) => v.notable && v.notable.class_best_lap)) {
    qualiClassBestSeen = true;
  }

  // Lap-time realism: every completed lap must sit within a sane band of its class
  // base pace. Catches the absolute-noise regression (sub-pace laps / cross-class
  // inversion) and inflated out-laps. Sampled once per (car, lap) via last_lap.
  for (const v of payload.vehicles) {
    if (v.last_lap == null) continue;
    const base = classPace(v.vehicle_class);
    if (v.last_lap < base * LAP_MIN_FACTOR || v.last_lap > base * LAP_MAX_FACTOR) {
      const key = `${v.slot_id}:${v.last_lap}`;
      if (seenLapKeys.has(key)) continue;
      seenLapKeys.add(key);
      if (lapBandViolations.length < 10) {
        lapBandViolations.push(
          `tick ${i} (${payload.mode}): ${v.driver_name} [${v.vehicle_class}] last_lap=${v.last_lap.toFixed(1)}s ` +
            `= ${(v.last_lap / base).toFixed(2)}x base ${base}s`,
        );
      }
    }
  }

  raceTicks = payload.mode === "race" ? (prevMode === "race" ? raceTicks + 1 : 0) : 0;
  prevMode = payload.mode;
  if (payload.mode === "race" && gridViolations.length < 10) {
    const last = payload.vehicles.reduce((a, b) => (b.position > a.position ? b : a));
    const spread = last.gap_to_leader;
    if (raceTicks === 0 && !(typeof spread === "number" && spread < START_SPREAD_MAX_SECONDS)) {
      gridViolations.push(
        `tick ${i}: at the green flag the last car (${last.driver_name}) is ${last.gap_to_leader}s behind the leader`,
      );
    }
    if (raceTicks * DT_SECONDS < OPENING_LAP_SECONDS) {
      const lapped = payload.vehicles.find((v) => v.laps_behind_leader >= 1);
      if (lapped) gridViolations.push(`tick ${i}: ${lapped.driver_name} is a lap down ${raceTicks * DT_SECONDS}s into the race`);
    }
  }

  if (payload.mode === "race") {
    for (const v of payload.vehicles) {
      const problems = [];
      if (!isLapCount(v.laps_behind_leader)) problems.push(`laps_behind_leader=${v.laps_behind_leader}`);
      if (!isLapCount(v.laps_behind_class_leader)) {
        problems.push(`laps_behind_class_leader=${v.laps_behind_class_leader}`);
      }
      if (v.position > 1 && !isLapCount(v.laps_behind_ahead)) problems.push(`laps_behind_ahead=${v.laps_behind_ahead}`);
      if (v.laps_behind_leader >= 1) {
        lappedSeen = true;
        if (v.gap_to_leader === 0) problems.push("lapped car with gap_to_leader 0 placeholder");
      }
      if (problems.length > 0 && lapFieldViolations.length < 10) {
        lapFieldViolations.push(`tick ${i}: ${v.driver_name} P${v.position} — ${problems.join(", ")}`);
      }
    }

    const sectors = payload.session?.sector_flags;
    const validSectors = Array.isArray(sectors) && sectors.length === 3 && sectors.every((f) => typeof f === "string");
    const anyYellowSector = validSectors && sectors.some((f) => f.toLowerCase() === "yellow");
    const fcy = payload.session?.full_course_yellow === true;
    const yellowProblems = [];
    if (!validSectors) yellowProblems.push(`sector_flags=${JSON.stringify(sectors)}`);
    for (const v of payload.vehicles) {
      if (typeof v.yellow_involved !== "boolean") {
        yellowProblems.push(`${v.driver_name} yellow_involved=${JSON.stringify(v.yellow_involved)}`);
      } else if (v.yellow_involved && !anyYellowSector && !fcy) {
        yellowProblems.push(`${v.driver_name} involved with no yellow sector and no FCY`);
      } else if (v.yellow_involved && v.in_pit) {
        yellowProblems.push(`${v.driver_name} involved while in the pit lane`);
      }
    }
    if (anyYellowSector && !fcy && payload.vehicles.some((v) => v.yellow_involved === true)) localYellowSeen = true;
    if (yellowProblems.length > 0 && yellowViolations.length < 10) {
      yellowViolations.push(`tick ${i}: ${yellowProblems.join(", ")}`);
    }
  }

  if (payload.mode === "race" && raceTicks === 0) {
    finishPrev = new Map();
    finishTick = new Map();
    retiredLap = new Map();
    anyFinished = false;
  }
  const finishProblems = [];
  if (payload.mode === "race" || payload.mode === "results") {
    const checkered = String(payload.session?.flag ?? "").toLowerCase() === "checkered";
    for (const v of payload.vehicles) {
      const code = v.finish_status;
      if (!isFinishCode(code)) {
        finishProblems.push(`${v.driver_name} finish_status=${JSON.stringify(code)}`);
        continue;
      }
      if (code === 2) dnfSeen = true;
      if (payload.mode === "race") {
        if (code === 1 && !checkered) finishProblems.push(`${v.driver_name} finished before the chequered flag`);
        if (code === 1 && !finishTick.has(v.slot_id)) finishTick.set(v.slot_id, i);
        if (code === 2) {
          if (!retiredLap.has(v.slot_id)) retiredLap.set(v.slot_id, v.last_lap);
          else if (v.last_lap !== retiredLap.get(v.slot_id)) {
            finishProblems.push(`${v.driver_name} completed a lap after retiring`);
          }
        }
        const prev = finishPrev.get(v.slot_id);
        if (prev != null && prev !== 0 && code !== prev) {
          finishProblems.push(`${v.driver_name} changed from ${prev} to ${code}`);
        }
        finishPrev.set(v.slot_id, code);
      } else if (code === 0) {
        finishProblems.push(`${v.driver_name} unclassified (0) in results`);
      }
    }
    // The leader takes the flag: on the first tick of the leg where anyone has finished, the car
    // that led on the PREVIOUS tick is one of them (several cars can cross within one tick). The
    // previous tick, because a finished car is re-ranked ahead of running cars on its lap, so this
    // tick's P1 would pass for any lead-lap car taking the flag.
    if (payload.mode === "race" && !anyFinished && payload.vehicles.some((v) => v.finish_status === 1)) {
      anyFinished = true;
      const prevLeader = lastRaceTick?.vehicles.find((v) => v.position === 1);
      const leaderNow = payload.vehicles.find((v) => v.slot_id === prevLeader?.slot_id);
      if (prevLeader && leaderNow?.finish_status !== 1) {
        const first = payload.vehicles.find((v) => v.finish_status === 1);
        finishProblems.push(`${first.driver_name} took the flag while leader ${prevLeader.driver_name} had not finished`);
      }
    }
    if (
      payload.mode === "race" &&
      payload.vehicles.some((v) => v.finish_status === 1) &&
      payload.vehicles.some((v) => v.finish_status === 0)
    ) {
      progressiveFinishSeen = true;
    }
    // Under the chequered flag the race clock and lap counter have run out.
    if (payload.mode === "race" && checkered) {
      for (const key of ["time_remaining", "laps_remaining"]) {
        const value = payload.session?.[key];
        if (value != null && value !== 0) finishProblems.push(`session.${key}=${value} under the chequered flag`);
      }
    }
    // Finished cars rank by laps completed, then crossing order: on the same lap count, a car
    // that finished on an earlier tick sits ahead of one that finished later. The payload has no
    // laps-completed field, so `laps_behind_leader` stands in for it; between two finished cars
    // the mock computes it from laps completed, so it is exact here.
    const finished = payload.vehicles.filter((v) => v.finish_status === 1 && finishTick.has(v.slot_id));
    for (const a of finished) {
      for (const b of finished) {
        const sameLaps = (a.laps_behind_leader ?? 0) === (b.laps_behind_leader ?? 0);
        if (sameLaps && finishTick.get(a.slot_id) < finishTick.get(b.slot_id) && a.position > b.position) {
          finishProblems.push(`${a.driver_name} finished before ${b.driver_name} but is classified behind`);
        }
      }
    }
    // Results classifies the cars that were still running when the race leg ended.
    if (payload.mode === "results" && lastRaceTick) {
      const stillRunning = lastRaceTick.vehicles.filter((v) => v.finish_status === 0).map((v) => v.slot_id);
      if (
        stillRunning.length > 0 &&
        stillRunning.every((id) => payload.vehicles.find((v) => v.slot_id === id)?.finish_status === 1)
      ) {
        resultsClassifiedSeen = true;
      }
    }
  } else {
    const carrier = payload.vehicles.find((v) => "finish_status" in v);
    if (carrier) finishProblems.push(`${carrier.driver_name} carries finish_status in ${payload.mode}`);
  }
  if (finishProblems.length > 0 && finishViolations.length < 10) {
    finishViolations.push(`tick ${i} (${payload.mode}): ${finishProblems.join(", ")}`);
  }
  if (payload.mode === "race") {
    const codes = payload.vehicles.map((v) => v.finish_status);
    if (codes.includes(0) && codes.includes(1) && codes.includes(2)) directorMixSeen = true;
    const problems = directorProblems(payload);
    if (problems.length > 0 && directorViolations.length < 10) {
      directorViolations.push(`tick ${i}: ${problems.join(", ")}`);
    }
  }
  lastRaceTick = payload.mode === "race" ? payload : payload.mode === "results" ? lastRaceTick : null;

  if (payload.mode === "race") {
    if (raceTicks === 0) {
      lastLeaderChangeTick = null;
      legLapCount = new Map();
      legLastLap = new Map();
      legClassMin = new Map();
      legClassRecords = new Map();
    }
    const before = new Map(legClassMin);
    for (const v of payload.vehicles) {
      if (v.last_lap == null || v.last_lap === legLastLap.get(v.slot_id)) continue;
      legLastLap.set(v.slot_id, v.last_lap);
      const laps = (legLapCount.get(v.slot_id) || 0) + 1;
      legLapCount.set(v.slot_id, laps);
      const best = before.get(v.vehicle_class);
      if (laps >= 2 && (best == null || v.last_lap < best)) {
        if (!legClassRecords.has(v.vehicle_class)) legClassRecords.set(v.vehicle_class, []);
        legClassRecords.get(v.vehicle_class).push({ slot_id: v.slot_id, lap: v.last_lap });
      }
      const min = legClassMin.get(v.vehicle_class);
      if (min == null || v.last_lap < min) legClassMin.set(v.vehicle_class, v.last_lap);
    }
  }

  {
    const list = payload.race_events;
    const problems = [];
    if (!Array.isArray(list)) problems.push(`race_events=${JSON.stringify(list)}`);
    else {
      if (list.length > 20) problems.push(`${list.length} events listed`);
      const ids = new Set();
      for (const e of list) {
        if (!e || typeof e.id !== "string") continue;
        ids.add(e.id);
        raceEventTypesSeen.add(e.type);
        const key = e.id.slice(0, e.id.lastIndexOf("-"));
        if (raceEventRunKey == null) raceEventRunKey = key;
        else if (key !== raceEventRunKey) problems.push(`id ${e.id} lacks run key ${raceEventRunKey}`);
        if (raceEventGone.has(e.id)) problems.push(`id ${e.id} came back after leaving the list`);
        const body = JSON.stringify(e);
        if (!raceEventFirstTick.has(e.id)) {
          raceEventFirstTick.set(e.id, i);
          raceEventBody.set(e.id, body);
          if (payload.mode === "race" && raceTicks * DT_SECONDS < RACE_START_QUIET_SECONDS) {
            problems.push(`${e.type} ${e.id} announced ${raceTicks * DT_SECONDS}s into the race`);
          }
          if (e.type === "leader_change") {
            const gap = lastLeaderChangeTick == null ? Infinity : (i - lastLeaderChangeTick) * DT_SECONDS;
            if (gap < LEADER_CHANGE_MIN_GAP_SECONDS) problems.push(`leader_change ${e.id} ${gap}s after the previous one`);
            lastLeaderChangeTick = i;
          }
          if (payload.mode === "race" && e.type === "fastest_lap" && e.vehicle_class != null) {
            const beaten = (legClassRecords.get(e.vehicle_class) ?? []).some((r) => r.lap > e.lap_time);
            if (!beaten) problems.push(`class fastest lap ${e.id} before ${e.vehicle_class} had a best from after the opening lap`);
          }
        } else if (raceEventBody.get(e.id) !== body) problems.push(`id ${e.id} changed while listed`);
        if (e.type === "fastest_lap" && e.vehicle_class == null) {
          const dup = list.find(
            (o) => o !== e && o.type === "fastest_lap" && o.vehicle_class != null && o.slot_id === e.slot_id && o.lap_time === e.lap_time,
          );
          if (dup) problems.push(`overall fastest lap ${e.id} also sent as class event ${dup.id}`);
        }
      }
      for (const id of raceEventPrevIds) {
        if (ids.has(id)) continue;
        raceEventGone.add(id);
        const listed = (i - raceEventFirstTick.get(id)) * DT_SECONDS;
        if (listed < RACE_EVENT_MIN_LISTED_SECONDS) problems.push(`id ${id} dropped after ${listed}s`);
      }
      raceEventPrevIds = ids;
    }
    if (problems.length > 0 && raceEventViolations.length < 10) {
      raceEventViolations.push(`tick ${i} (${payload.mode}): ${problems.join(", ")}`);
    }
  }

  const errors = validate(payload);
  if (errors.length > 0) {
    failed += 1;
    console.error(`FAIL tick ${i} (mode "${payload.mode}"):`);
    for (const err of errors) console.error(`  - ${err}`);
    if (failed >= 5) {
      console.error("\n... stopping after 5 failed ticks.");
      break;
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} tick(s) failed validation out of ${TICKS}.`);
  process.exit(1);
}

// Every phase must have been reached and validated, not just the race.
const missing = PHASES.filter((mode) => !ticksByMode.has(mode));
if (missing.length > 0) {
  console.error(`\nExpected every phase to be visited, but never saw: ${missing.join(", ")}.`);
  console.error(`Observed: ${[...ticksByMode.entries()].map(([m, n]) => `${m}=${n}`).join(", ")}.`);
  process.exit(1);
}

if (!qualiClassBestSeen) {
  console.error("\nQualifying never surfaced a notable.class_best_lap flag — the class-best edge is not exercised.");
  process.exit(1);
}

if (lapBandViolations.length > 0) {
  console.error(
    `\nImplausible lap times (outside [${LAP_MIN_FACTOR}x, ${LAP_MAX_FACTOR}x] of class base pace):`,
  );
  for (const v of lapBandViolations) console.error(`  - ${v}`);
  process.exit(1);
}

if (lapFieldViolations.length > 0) {
  console.error("\nRace-phase lap-deficit fields missing or invalid (ADR 0012):");
  for (const v of lapFieldViolations) console.error(`  - ${v}`);
  process.exit(1);
}

if (gridViolations.length > 0) {
  console.error(`
Unrealistic starting grid (#217; leader-to-last must be < ${START_SPREAD_MAX_SECONDS}s, nobody lapped in the opening lap):`);
  for (const v of gridViolations) console.error(`  - ${v}`);
  process.exit(1);
}

if (yellowViolations.length > 0) {
  console.error("\nRace-phase local-yellow fields missing or inconsistent (ADR 0016):");
  for (const v of yellowViolations) console.error(`  - ${v}`);
  process.exit(1);
}

// The backmarker only pits during its local-yellow window in a long race (its stint outlasts the
// window at the 400 s used above), so run one long race leg just to check the pit-lane exclusion:
// a car in the pit lane is never `yellow_involved` (SPEC.md; #234).
{
  const LONG_RACE_SECONDS = 2000;
  const longRace = createSimulator({
    lockPhase: "race",
    phaseSeconds: { race: LONG_RACE_SECONDS },
    rng: mulberry32(SEED + 1),
  });
  // The window fractions mirror simulate.js LOCAL_YELLOW_START / LOCAL_YELLOW_END.
  const involvedSlots = new Set();
  let pitDuringWindow = false;
  const longDirectorViolations = [];
  let longRetireeSeen = false;
  for (let t = 0; t < LONG_RACE_SECONDS; t += DT_SECONDS) {
    const payload = longRace.step(DT_SECONDS);
    const frac = t / LONG_RACE_SECONDS;
    const inWindow = frac >= 0.1 && frac < 0.2;
    for (const v of payload.vehicles) {
      if (v.yellow_involved && v.in_pit) {
        yellowViolations.push(`long race t=${t}s: ${v.driver_name} involved while in the pit lane`);
      }
      if (inWindow && v.yellow_involved) involvedSlots.add(v.slot_id);
      // Exercised only if a car that was involved in this window is later seen in the pits in it.
      if (inWindow && v.in_pit && involvedSlots.has(v.slot_id)) pitDuringWindow = true;
    }
    // The long race laps the parked retiree many more times, so the director check runs here too.
    if (payload.vehicles.some((v) => v.finish_status === 2)) longRetireeSeen = true;
    const problems = directorProblems(payload);
    if (problems.length > 0 && longDirectorViolations.length < 10) {
      longDirectorViolations.push(`long race t=${t}s: ${problems.join(", ")}`);
    }
  }
  if (longDirectorViolations.length > 0) {
    console.error("\nThe long race's director put a car that is out of the fight on camera (#237):");
    for (const v of longDirectorViolations) console.error(`  - ${v}`);
    process.exit(1);
  }
  if (!longRetireeSeen) {
    console.error("\nNo car retired in the long race — its director check is not exercised.");
    process.exit(1);
  }
  if (yellowViolations.length > 0) {
    console.error("\nLocal-yellow involvement while in the pit lane (#234):");
    for (const v of yellowViolations.slice(0, 10)) console.error(`  - ${v}`);
    process.exit(1);
  }
  if (!pitDuringWindow) {
    console.error("\nIn the long race no involved car pitted during its local yellow — the pit-lane exclusion is not exercised.");
    process.exit(1);
  }
}

if (!localYellowSeen) {
  console.error("\nThe race phase never staged a local yellow (a yellow sector outside FCY with an involved car) — the local-yellow case is not exercised.");
  process.exit(1);
}

if (multiclassViolationCount > 0) {
  console.error(
    `\nsession.multiclass missing or not matching the class mix on ${multiclassViolationCount} tick(s) (ADR 0022):`,
  );
  for (const v of multiclassViolations) console.error(`  - ${v}`);
  process.exit(1);
}

if (finishViolations.length > 0) {
  console.error("\nfinish_status missing or inconsistent (ADR 0017):");
  for (const v of finishViolations) console.error(`  - ${v}`);
  process.exit(1);
}

if (directorViolations.length > 0) {
  console.error("\nThe race director put a car that is out of the fight on camera (#237):");
  for (const v of directorViolations) console.error(`  - ${v}`);
  process.exit(1);
}

if (!directorMixSeen) {
  console.error("\nNo race tick had a retired car, a finished car and a running car at once — the director exclusion is not exercised.");
  process.exit(1);
}

if (!progressiveFinishSeen) {
  console.error("\nThe race never showed the flag falling progressively (some cars finished while others still running) — the finish chip is not exercised.");
  process.exit(1);
}

if (!resultsClassifiedSeen) {
  console.error("\nResults never classified a car that was still running when the race leg ended — that path is not exercised.");
  process.exit(1);
}

if (!dnfSeen) {
  console.error("\nNo car ever retired (finish_status 2) — the DNF chip is not exercised.");
  process.exit(1);
}

if (raceEventViolations.length > 0) {
  console.error("\nrace_events missing or breaking the mock's rolling-list policy (ADR 0023):");
  for (const v of raceEventViolations) console.error(`  - ${v}`);
  process.exit(1);
}

{
  const missingTypes = ["fastest_lap", "leader_change", "retirement", "penalty"].filter((t) => !raceEventTypesSeen.has(t));
  if (missingTypes.length > 0) {
    console.error(`\nThe race never announced these race_events types: ${missingTypes.join(", ")} — the race update box is not exercised.`);
    process.exit(1);
  }
}

if (eventInfoViolations.length > 0) {
  console.error("\nevent / info_lines missing or malformed (ADR 0024):");
  for (const v of eventInfoViolations) console.error(`  - ${v}`);
  process.exit(1);
}

if (!eventRoundAdvanced || infoLineListsSeen.size < 2) {
  console.error(
    `\nThe event round never advanced (${eventRoundAdvanced}) or info_lines never changed (${infoLineListsSeen.size} list(s)) — the info panel's live changes are not exercised.`
  );
  process.exit(1);
}

if (!lappedSeen) {
  console.error("\nThe race phase never lapped a car (no laps_behind_leader >= 1) — the lapped-car case is not exercised.");
  process.exit(1);
}

console.log(`All ${TICKS} simulated ticks valid against spec/v1 required-field contract.`);
console.log(`Phases covered: ${PHASES.map((m) => `${m} (${ticksByMode.get(m)} ticks)`).join(", ")}.`);
console.log("Qualifying surfaced a notable.class_best_lap flag (class-best edge exercised).");
console.log(`Lap times within [${LAP_MIN_FACTOR}x, ${LAP_MAX_FACTOR}x] of class base pace.`);
console.log(`Starting grid within ${START_SPREAD_MAX_SECONDS}s, nobody lapped in the opening lap (#217).`);
console.log("Race phase lapped a backmarker and carried valid laps_behind_* fields (ADR 0012).");
console.log("Race phase staged a local yellow with valid sector_flags / yellow_involved fields (ADR 0016).");
console.log("Race phase took the chequered flag progressively, retired a car, and results classified every car (ADR 0017).");
console.log("Every tick carried a boolean session.multiclass matching the class mix (ADR 0022).");
console.log("Every tick carried a valid rolling race_events list, and the race announced all four types (ADR 0023).");
console.log(`Every tick carried an event and info_lines; the round advanced and ${infoLineListsSeen.size} line lists were sent (ADR 0024).`);
console.log("Race director never put a retired car, or a finished car while others raced, on camera (#237).");

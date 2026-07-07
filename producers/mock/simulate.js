// battlecast mock producer — live race simulator.
//
// Produces a continuously evolving spec-v1 `state` snapshot instead of
// replaying a handful of fixed scenarios. Rather than a single endless green
// flag, the simulator auto-cycles through a full broadcast session so a live
// mock exercises the whole overlay set:
//
//   qualifying → grid → race → results → (loop)
//
// Cars run at a per-class base pace plus a per-car skill offset and a slow
// random-walk pace fluctuation, so lap times, running order, gaps, and on-track
// battles emerge and change over time. Each phase classifies the field on its
// own terms — qualifying by best lap, the grid frozen to the qualifying result,
// the race by distance covered, the results frozen to the final race order —
// and the on-camera `subject` keeps cutting throughout so the subject-driven
// lower-thirds fire in every phase. The race phase is the original continuous
// green-flag simulation, unchanged, just scoped to one leg of the cycle.
//
// This is a dev/demo tool. The fixtures in spec/v1/fixtures/ remain the
// source of truth for behavioral tests (see CONTRIBUTING.md); nothing here
// is used by the app's test suite.

const CLASSES = [
  { key: "gtp", basePace: 92 },
  { key: "lmp2", basePace: 99 },
  { key: "gt3", basePace: 107 },
];

// slot_id / car number pairings reuse the existing spec-v1 fixtures'
// conventions (car-44 Hamilton, car-1 Verstappen, car-16 Leclerc, car-4
// Norris, car-14 Alonso) where they overlap, extended to a full multi-class
// grid so the standings tower's class-chip colors actually get exercised.
const GRID = [
  { number: 44, driver: "Hamilton", classKey: "gtp" },
  { number: 1, driver: "Verstappen", classKey: "gtp" },
  { number: 16, driver: "Leclerc", classKey: "gtp" },
  { number: 4, driver: "Norris", classKey: "gtp" },
  { number: 63, driver: "Russell", classKey: "gtp" },
  { number: 81, driver: "Piastri", classKey: "lmp2" },
  { number: 55, driver: "Sainz", classKey: "lmp2" },
  { number: 11, driver: "Perez", classKey: "lmp2" },
  { number: 31, driver: "Ocon", classKey: "lmp2" },
  { number: 10, driver: "Gasly", classKey: "lmp2" },
  { number: 14, driver: "Alonso", classKey: "gt3" },
  { number: 23, driver: "Albon", classKey: "gt3" },
  { number: 22, driver: "Tsunoda", classKey: "gt3" },
  { number: 18, driver: "Stroll", classKey: "gt3" },
];

const LAP_UNIT = 1; // one arbitrary "distance around the lap" unit
const CLOSE_BATTLE_WINDOW = 1.5; // seconds — matches the design system's intensity formula
// Minimum on-camera dwell before the "director" will cut away, expressed in SIM
// SECONDS (not ticks) so it is invariant to step granularity — the server may
// sub-step the simulator to push camera cuts promptly without changing how long a
// car actually stays on camera. 32 sim-seconds ≈ the previous 16 ticks × 2s/tick.
const SUBJECT_MIN_DWELL_SECONDS = 32;
const SUBJECT_SWITCH_MARGIN = 0.4; // seconds — a new battle must be meaningfully tighter to steal the cut
// In the static phases (grid, results) there is no on-track battle to chase, so
// the director simply rotates the on-camera subject on this shorter cadence to
// keep the lower-thirds firing while a takeover board is up.
const SUBJECT_STATIC_DWELL_SECONDS = 10;

// The broadcast session, in cycle order. `mode` is a free-form string in the
// spec (schema.json documents "race"/"qualifying"/... as examples and requires
// consumers to tolerate unknowns), so "grid" and "results" are valid session
// intents that no schema change is needed to express. The /grid and /results
// slides are standalone routes, not mode-gated, so freezing the classification
// per phase is all that is required to make them show a real grid / results
// board.
const PHASES = ["qualifying", "grid", "race", "results"];

// Default phase durations in SIM seconds (race-time), overridable via env so a
// tester can cycle faster or slower. Qualifying and race are long enough for
// cars to complete several flying/racing laps (a lap is ~92–107 sim-seconds at
// these paces) so best laps populate, improve, and change class-best hands;
// the grid and results legs are short takeover-board interludes. See README.md.
function envSeconds(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}
const DEFAULT_PHASE_SECONDS = {
  qualifying: envSeconds("QUALI_SECONDS", 300),
  grid: envSeconds("GRID_SECONDS", 30),
  race: envSeconds("RACE_SECONDS", 300),
  results: envSeconds("RESULTS_SECONDS", 30),
};

function classPace(classKey) {
  return CLASSES.find((c) => c.key === classKey).basePace;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Split a lap time into 3 sectors that sum back to it exactly. */
function splitSectors(lapTime) {
  const r1 = 0.32 + (Math.random() - 0.5) * 0.02;
  const r2 = 0.34 + (Math.random() - 0.5) * 0.02;
  const s1 = lapTime * r1;
  const s2 = lapTime * r2;
  const s3 = lapTime - s1 - s2;
  return [s1, s2, s3].map((s) => Math.round(s * 1000) / 1000);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Producer-owned session status for the spec-v1 `session` object (flag / Full
 * Course Yellow / Safety Car / progress readout). Dumb overlay, smart producer:
 * the widget renders exactly what we hand it, so every judgment — the caution
 * windows and the timed-vs-lap progress `basis` — is made here, not in the
 * consumer. Across the phase cycle this exercises the whole session overlay: a
 * timed race leg, a lap-limited race leg, an FCY window, a Safety-Car window,
 * the endurance `basis:"laps"` flip on the final timed lap, and the checkered
 * flag at results. Every field is optional in the schema; nulls stand in for
 * "not applicable to this session type". `timedRaceLeg` alternates the race
 * phase between a timed and a lap-limited leg on successive cycles.
 */
function buildSession(phase, elapsed, total, timedRaceLeg) {
  const frac = total > 0 ? clamp(elapsed / total, 0, 1) : 0;

  if (phase === "qualifying") {
    // Timed qualifying: a green-flag countdown clock, no lap limit.
    return {
      flag: "green",
      full_course_yellow: false,
      safety_car: false,
      time_remaining: round1(total - elapsed),
      session_length: total,
      laps_remaining: null,
      total_laps: null,
      current_lap: null,
      basis: null,
    };
  }

  if (phase === "grid") {
    // Pre-race formation: field parked, no live progress readout yet.
    return {
      flag: "none",
      full_course_yellow: false,
      safety_car: false,
      time_remaining: null,
      session_length: null,
      laps_remaining: null,
      total_laps: null,
      current_lap: null,
      basis: null,
    };
  }

  if (phase === "results") {
    // Race over: checkered flag, no live progress readout.
    return {
      flag: "checkered",
      full_course_yellow: false,
      safety_car: false,
      time_remaining: null,
      session_length: null,
      laps_remaining: null,
      total_laps: null,
      current_lap: null,
      basis: null,
    };
  }

  // phase === "race". Model a caution window mid-leg: a Full Course Yellow from
  // 25%–40% of the leg, with a Safety Car deployed under it from 30%–40%; green
  // otherwise. `flag` carries the local flag colour; `full_course_yellow` is the
  // distinct session-wide caution.
  const fcy = frac >= 0.25 && frac < 0.4;
  const sc = frac >= 0.3 && frac < 0.4;
  const flag = fcy ? "yellow" : "green";

  if (timedRaceLeg) {
    // Timed race leg: a countdown clock (auto-selected via non-null
    // time_remaining), laps null — EXCEPT the endurance "time-certain + N laps"
    // flip. On the final timed lap (last 10%) the producer sets basis:"laps" and
    // populates laps_remaining so the widget flips clock → lap counter with no
    // endurance logic of its own; both time_remaining and laps_remaining are
    // briefly non-null here, and `basis` breaks the tie.
    const flipping = frac >= 0.9;
    return {
      flag,
      full_course_yellow: fcy,
      safety_car: sc,
      time_remaining: round1(total - elapsed),
      session_length: total,
      laps_remaining: flipping ? Math.max(1, Math.ceil((1 - frac) / 0.05)) : null,
      total_laps: null,
      current_lap: null,
      basis: flipping ? "laps" : null,
    };
  }

  // Lap-limited race leg: a lap counter (auto-selected via non-null laps with
  // null time), counting down from total_laps across the leg. The producer owns
  // the "lap X of Y" counting convention — it emits `current_lap` directly (the
  // lap the leader is on) so the widget renders it verbatim rather than deriving
  // it; here that is total_laps − laps_remaining + 1.
  const totalLaps = 20;
  const lapsRemaining = clamp(Math.ceil(totalLaps * (1 - frac)), 1, totalLaps);
  return {
    flag,
    full_course_yellow: fcy,
    safety_car: sc,
    time_remaining: null,
    session_length: null,
    laps_remaining: lapsRemaining,
    total_laps: totalLaps,
    current_lap: clamp(totalLaps - lapsRemaining + 1, 1, totalLaps),
    basis: null,
  };
}

/**
 * Producer-owned LIVE-INPUT telemetry for the on-camera subject, for the spec-v1
 * `subject.telemetry` sub-object (throttle / brake / speed / gear). Dumb overlay,
 * smart producer: the on-board HUD (#26) renders these verbatim every tick, so the
 * synthesis lives here. The sim does not model pedal inputs, so we drive a synthetic
 * corner→straight cycle off the clock (period `CORNER_CYCLE_SECONDS`): on the straight
 * the car is at full throttle / top gear / top speed; mid-cycle it brakes into a
 * corner (throttle drops, brake rises, speed and gear fall), then accelerates out.
 * Top speed scales inversely with the car's class pace (a faster class is quicker), so
 * the readout differs across subjects. Emitted only in the RUNNING phases; a parked
 * car (grid / results) has no live inputs, so the producer omits the whole block and
 * the HUD idles — which also keeps the no-telemetry backward-compat path exercised live.
 * `speed` is a plain number in a producer-defined unit (see SPEC); here ~km/h.
 */
const CORNER_CYCLE_SECONDS = 14;

function buildTelemetry(car, clock) {
  // corner ∈ [0,1]: 0 on the straight, 1 at the apex (single hump per cycle).
  const t = (clock % CORNER_CYCLE_SECONDS) / CORNER_CYCLE_SECONDS;
  const corner = Math.max(0, Math.sin(t * Math.PI));
  // Brake only bites in the deep part of the braking zone; throttle is the inverse
  // of the corner, so the two bars cross over through the corner.
  const brake = round2(clamp((corner - 0.35) / 0.5, 0, 1) * 0.95);
  const throttle = round2(clamp(1 - corner * 1.05, 0, 1));
  // Top speed inversely proportional to class pace (~326 for a 92s-pace GTP, ~280 for
  // a 107s-pace GT3), modulated by the car's own pace-noise for a little life.
  const topSpeed = 30000 / car.pace;
  const speed = Math.round(topSpeed * (1 - corner * 0.55) * (1 + (car.noiseFactor || 0)));
  // Gear tracks the speed fraction: ~2 through a slow corner up to 8 flat-out.
  const gear = clamp(Math.round(1 + (speed / topSpeed) * 7), 1, 8);
  return { throttle, brake, speed, gear };
}

/**
 * Gap in seconds from each car to the OVERALL classification leader (order[0]),
 * keyed by slot_id, for the spec-v1 `gap_to_leader` field. In a lap-classified
 * phase (qualifying / grid) the gap is the car's best-lap delta to the leader; in
 * a distance-classified phase (race / results) it is the on-track time gap,
 * accumulated from the adjacent pair deltas along the running order (the same
 * distance→seconds conversion used for the subject's gap_ahead/gap_behind). The
 * leader is 0 once it has comparable timing (else null — e.g. a qualifying leader
 * before any lap is set); a trailing car with no comparable timing is null.
 */
function gapToLeaderMap(order, byLap) {
  const map = new Map();
  if (order.length === 0) return map;
  const leader = order[0];
  if (byLap) {
    const lead = leader.best_lap;
    for (const car of order) {
      map.set(car.slot_id, lead != null && car.best_lap != null ? round3(car.best_lap - lead) : null);
    }
  } else {
    let cum = 0;
    map.set(leader.slot_id, 0);
    for (let i = 1; i < order.length; i++) {
      const ahead = order[i - 1];
      const car = order[i];
      const avgSpeed = (1 / car.pace + 1 / ahead.pace) / 2;
      cum += (ahead.distance - car.distance) / avgSpeed;
      map.set(car.slot_id, round3(cum));
    }
  }
  return map;
}

/** A fresh, session-start field: no timing yet, staggered on the grid. `startClock`
 *  seeds each car's lap-timing baseline to the CURRENT sim clock — critical when the
 *  session loops back to qualifying at a non-zero clock, or the first completed lap
 *  would be measured against clock 0 and report the entire elapsed session as one
 *  enormous "lap". */
function makeCars(startClock = 0) {
  return GRID.map((entry, i) => {
    const skillOffset = ((i * 37) % 11) / 10 - 0.5; // deterministic spread, -0.5..+0.5s
    // Stagger the starting grid so the field doesn't begin perfectly bunched.
    const distance = -i * (LAP_UNIT / GRID.length) * 2;
    return {
      slot_id: `car-${entry.number}`,
      driver_name: entry.driver,
      vehicle_class: entry.classKey,
      pace: classPace(entry.classKey) + skillOffset,
      noiseFactor: 0,
      distance,
      // Measure the first lap from the car's own staggered start (not 0), so the
      // opening lap is a normal flying lap rather than an inflated multi-lap "out
      // lap" for cars that start further back.
      lapStartDistance: distance,
      lastLapClock: startClock,
      last_lap: null,
      best_lap: null,
      sector_times: [],
      improvedBestThisStep: false,
      position: i + 1,
    };
  });
}

/** Advance one car's distance and, on a completed lap, its lap/sector timing. */
function advanceCar(car, dtSeconds, clock) {
  // Slow random-walk pace fluctuation so gaps ebb and flow organically instead of
  // separating (or converging) monotonically. It is a fraction of the car's OWN
  // base speed (a ±4% band), not an absolute term: an absolute term is a huge
  // fraction of the slower classes' speed and produced implausible lap times and
  // cross-class pace inversion (a GT3 out-lapping a GTP). ±4% keeps lap times within
  // a realistic band of the car's pace while still shuffling intra-class order.
  car.noiseFactor = clamp(car.noiseFactor + (Math.random() - 0.5) * 0.01, -0.04, 0.04);
  const baseSpeed = 1 / car.pace;
  car.distance += baseSpeed * (1 + car.noiseFactor) * dtSeconds;

  if (car.distance - car.lapStartDistance >= LAP_UNIT) {
    car.lapStartDistance += LAP_UNIT;
    const lap = clock - car.lastLapClock;
    car.lastLapClock = clock;
    car.last_lap = Math.round(lap * 1000) / 1000;
    const prevBest = car.best_lap;
    if (prevBest == null || car.last_lap < prevBest) {
      car.best_lap = car.last_lap;
      car.improvedBestThisStep = true;
    }
    car.sector_times = splitSectors(car.last_lap);
  }
}

/**
 * Qualifying classification: fastest best_lap first. Cars without a lap yet sort
 * last (among themselves by distance so the order is stable), which is what
 * seeds the eventual starting grid.
 */
function byBestLap(a, b) {
  if (a.best_lap == null && b.best_lap == null) return b.distance - a.distance;
  if (a.best_lap == null) return 1;
  if (b.best_lap == null) return -1;
  if (a.best_lap !== b.best_lap) return a.best_lap - b.best_lap;
  return b.distance - a.distance;
}

/** Race classification: farthest total distance covered first (multi-class independent). */
function byDistance(a, b) {
  return b.distance - a.distance;
}

function createSimulator(config = {}) {
  const phaseSeconds = { ...DEFAULT_PHASE_SECONDS, ...(config.phaseSeconds || {}) };
  const onPhaseChange = typeof config.onPhaseChange === "function" ? config.onPhaseChange : null;

  let cars = makeCars();
  let clock = 0;

  let phase = PHASES[0]; // "qualifying"
  let phaseElapsed = 0;
  let announced = false;
  // Alternates the race phase between a timed leg and a lap-limited leg on
  // successive cycles, so a long enough run exercises both session progress
  // bases. Incremented on each entry into the race phase; even = timed.
  let raceLegIndex = -1;
  // For the static (grid / results) phases: the frozen running order captured on
  // entry, as an array of slot_ids in classified order.
  let frozenOrder = null;

  let subjectSlotId = null;
  let subjectSinceClock = 0;

  function announce(p) {
    if (onPhaseChange) onPhaseChange(p, Math.round(clock));
  }

  // Freeze the current classification (using `sortFn`) as the phase's fixed
  // order — used entering grid (qualifying result) and results (final race).
  function freezeOrder(sortFn) {
    const order = [...cars].sort(sortFn);
    order.forEach((car, i) => {
      car.position = i + 1;
    });
    frozenOrder = order.map((car) => car.slot_id);
  }

  // Re-stagger the field for a standing start in grid order and reset race
  // timing so the race sets its own fresh best laps (and thus its own
  // class-best edges), independent of the qualifying session.
  function startRaceFromGrid() {
    const n = cars.length;
    frozenOrder.forEach((slotId, i) => {
      const car = cars.find((c) => c.slot_id === slotId);
      car.distance = -i * (LAP_UNIT / n) * 2;
      car.lapStartDistance = car.distance;
      car.lastLapClock = clock;
      car.last_lap = null;
      car.best_lap = null;
      car.sector_times = [];
      car.noiseFactor = 0;
      car.improvedBestThisStep = false;
    });
  }

  function enterPhase(p) {
    phase = p;
    phaseElapsed = 0;
    // Reset the on-camera subject so the first frame of the new phase re-cuts,
    // firing the lower-thirds against the new classification.
    subjectSlotId = null;
    if (p === "qualifying") {
      // Loop back to a clean session: a fresh field with no timing. Seed lap timing
      // to the current clock so the first lap of a looped-back session isn't measured
      // against clock 0 (which would report the whole prior session as one lap).
      cars = makeCars(clock);
      frozenOrder = null;
    } else if (p === "grid") {
      // Grid = the qualifying result, frozen as the starting order.
      freezeOrder(byBestLap);
    } else if (p === "race") {
      raceLegIndex += 1;
      startRaceFromGrid();
    } else if (p === "results") {
      // Results = the final race classification, frozen.
      freezeOrder(byDistance);
    }
    announce(p);
  }

  // Running phases (qualifying, race): pick the tightest on-track battle with
  // hysteresis and derive the subject's gaps/intensity from track proximity.
  function runningDirector(order) {
    // Gap to the car immediately ahead/behind, converted from a distance
    // delta to seconds via the pair's average speed.
    const gapAhead = new Map();
    const gapBehind = new Map();
    for (let i = 0; i < order.length; i++) {
      const car = order[i];
      if (i > 0) {
        const ahead = order[i - 1];
        const avgSpeed = (1 / car.pace + 1 / ahead.pace) / 2;
        gapAhead.set(car.slot_id, (ahead.distance - car.distance) / avgSpeed);
      }
      if (i < order.length - 1) {
        const behind = order[i + 1];
        const avgSpeed = (1 / car.pace + 1 / behind.pace) / 2;
        gapBehind.set(car.slot_id, (car.distance - behind.distance) / avgSpeed);
      }
    }

    function closestGapFor(slotId) {
      return Math.min(gapAhead.get(slotId) ?? Infinity, gapBehind.get(slotId) ?? Infinity);
    }

    let bestSlotId = order[0].slot_id;
    let bestGap = closestGapFor(bestSlotId);
    for (const car of order) {
      const g = closestGapFor(car.slot_id);
      if (g < bestGap) {
        bestGap = g;
        bestSlotId = car.slot_id;
      }
    }

    if (subjectSlotId == null) {
      subjectSlotId = bestSlotId;
      subjectSinceClock = clock;
    } else if (clock - subjectSinceClock >= SUBJECT_MIN_DWELL_SECONDS && bestSlotId !== subjectSlotId) {
      const currentGap = closestGapFor(subjectSlotId);
      if (bestGap < currentGap - SUBJECT_SWITCH_MARGIN) {
        subjectSlotId = bestSlotId;
        subjectSinceClock = clock;
      }
    }

    const subjectClosest = closestGapFor(subjectSlotId);
    const intensity = Number.isFinite(subjectClosest)
      ? clamp(1 - subjectClosest / CLOSE_BATTLE_WINDOW, 0, 1)
      : 0;

    return {
      subjectCar: cars.find((c) => c.slot_id === subjectSlotId),
      relationship: {
        gap_ahead: gapAhead.has(subjectSlotId) ? round1(gapAhead.get(subjectSlotId)) : null,
        gap_behind: gapBehind.has(subjectSlotId) ? round1(gapBehind.get(subjectSlotId)) : null,
        battle_intensity: Math.round(intensity * 100) / 100,
      },
    };
  }

  // Static phases (grid, results): the field is parked, so there is no battle to
  // chase — just rotate the on-camera subject through the frozen order on a
  // short cadence so the lower-thirds keep firing while the board is up.
  function staticDirector(order) {
    const stillOnCamera = subjectSlotId != null && order.some((c) => c.slot_id === subjectSlotId);
    if (!stillOnCamera) {
      subjectSlotId = order[0].slot_id;
      subjectSinceClock = clock;
    } else if (clock - subjectSinceClock >= SUBJECT_STATIC_DWELL_SECONDS) {
      const idx = order.findIndex((c) => c.slot_id === subjectSlotId);
      subjectSlotId = order[(idx + 1) % order.length].slot_id;
      subjectSinceClock = clock;
    }
    return {
      subjectCar: cars.find((c) => c.slot_id === subjectSlotId),
      relationship: { gap_ahead: null, gap_behind: null, battle_intensity: 0 },
    };
  }

  function step(dtSeconds) {
    // Announce the opening phase once so a tester sees it before any transition.
    if (!announced) {
      announced = true;
      announce(phase);
    }

    clock += dtSeconds;
    phaseElapsed += dtSeconds;
    if (phaseElapsed >= phaseSeconds[phase]) {
      const next = PHASES[(PHASES.indexOf(phase) + 1) % PHASES.length];
      enterPhase(next);
    }

    const running = phase === "qualifying" || phase === "race";
    for (const car of cars) {
      // Reset the per-step "just set a personal best" flag; only a lap completed
      // on THIS step in a running phase can set it true.
      car.improvedBestThisStep = false;
      if (running) advanceCar(car, dtSeconds, clock);
    }

    // Producer-computed notability (dumb overlay, smart producer — see
    // docs/decisions/0002-lower-third-widgets.md). We hold authoritative sim
    // state, so we derive these facts here; the consumer only renders them.
    // Fastest best_lap overall (session best) and per class (class best); the
    // class-best time doubles as each car's `target_lap` (the time to beat). As
    // cars improve their laps in qualifying/race, the class-best holder changes
    // hands, which is exactly the false→true `class_best_lap` edge the #22
    // widget's CLASS BEST flash and re-cut reveal are built to catch.
    const classBest = new Map(); // vehicle_class -> fastest best_lap in that class
    let sessionBest = null;
    for (const car of cars) {
      if (car.best_lap == null) continue;
      const cb = classBest.get(car.vehicle_class);
      if (cb == null || car.best_lap < cb) classBest.set(car.vehicle_class, car.best_lap);
      if (sessionBest == null || car.best_lap < sessionBest) sessionBest = car.best_lap;
    }

    // Running order, classified on the phase's own terms.
    let order;
    if (phase === "qualifying") {
      order = [...cars].sort(byBestLap);
    } else if (phase === "race") {
      order = [...cars].sort(byDistance);
    } else {
      // grid / results — the frozen classification captured on phase entry.
      order = frozenOrder.map((slotId) => cars.find((c) => c.slot_id === slotId));
    }
    order.forEach((car, i) => {
      car.position = i + 1;
    });

    // Gap to the overall leader for each car — lap-delta in the lap-classified
    // phases, on-track time gap in the distance-classified ones.
    const gapToLeader = gapToLeaderMap(order, phase === "qualifying" || phase === "grid");

    const { subjectCar, relationship } = running ? runningDirector(order) : staticDirector(order);

    const session = buildSession(phase, phaseElapsed, phaseSeconds[phase], raceLegIndex % 2 === 0);

    return {
      schemaVersion: "1",
      mode: phase,
      vehicles: order.map((car) => {
        const target = car.best_lap == null ? null : classBest.get(car.vehicle_class);
        return {
          slot_id: car.slot_id,
          driver_name: car.driver_name,
          vehicle_class: car.vehicle_class,
          position: car.position,
          last_lap: car.last_lap,
          best_lap: car.best_lap,
          sector_times: car.sector_times,
          gap_to_leader: gapToLeader.get(car.slot_id) ?? null,
          notable: {
            class_best_lap: car.best_lap != null && car.best_lap === classBest.get(car.vehicle_class),
            session_best_lap: car.best_lap != null && car.best_lap === sessionBest,
            personal_best_lap: car.improvedBestThisStep === true,
          },
          target_lap: target ?? null,
          delta_to_target:
            car.best_lap != null && target != null ? Math.round((car.best_lap - target) * 1000) / 1000 : null,
        };
      }),
      subject: {
        slot_id: subjectCar.slot_id,
        driver_name: subjectCar.driver_name,
        // Live-input telemetry only while the car is actually being driven (running
        // phases). Parked phases (grid / results) omit it, so the HUD idles.
        ...(running ? { telemetry: buildTelemetry(subjectCar, clock) } : {}),
      },
      relationship,
      session,
    };
  }

  return { step };
}

module.exports = { createSimulator, PHASES, classPace };

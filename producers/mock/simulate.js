// battlecast mock producer — live race simulator.
//
// Produces a continuously evolving spec-v1 `state` snapshot instead of
// replaying a handful of fixed scenarios: cars run at a per-class base pace
// plus a per-car skill offset and a slow random-walk pace fluctuation, so
// running order, gaps, and on-track battles emerge and change over time.
// The on-camera `subject` is picked the way a broadcast director would —
// whichever battle is currently tightest — with hysteresis so the cut
// doesn't change every tick.
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
const SUBJECT_MIN_DWELL_TICKS = 16; // ~12s of sim time before the "director" will cut away
const SUBJECT_SWITCH_MARGIN = 0.4; // seconds — a new battle must be meaningfully tighter to steal the cut

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

function createSimulator() {
  const cars = GRID.map((entry, i) => {
    const skillOffset = ((i * 37) % 11) / 10 - 0.5; // deterministic spread, -0.5..+0.5s
    return {
      slot_id: `car-${entry.number}`,
      driver_name: entry.driver,
      vehicle_class: entry.classKey,
      pace: classPace(entry.classKey) + skillOffset,
      noiseVelocity: 0,
      // Stagger the starting grid so the field doesn't begin perfectly bunched.
      distance: -i * (LAP_UNIT / GRID.length) * 2,
      lapStartDistance: 0,
      lastLapClock: 0,
      last_lap: null,
      best_lap: null,
      sector_times: [],
    };
  });

  let clock = 0;
  let tick = 0;
  let subjectSlotId = null;
  let subjectSinceTick = 0;

  function step(dtSeconds) {
    clock += dtSeconds;
    tick += 1;

    for (const car of cars) {
      // Slow random-walk pace fluctuation so gaps ebb and flow organically
      // instead of separating (or converging) monotonically.
      car.noiseVelocity = clamp(car.noiseVelocity + (Math.random() - 0.5) * 0.0015, -0.008, 0.008);
      const baseSpeed = 1 / car.pace;
      car.distance += (baseSpeed + car.noiseVelocity) * dtSeconds;

      if (car.distance - car.lapStartDistance >= LAP_UNIT) {
        car.lapStartDistance += LAP_UNIT;
        const lap = clock - car.lastLapClock;
        car.lastLapClock = clock;
        car.last_lap = Math.round(lap * 1000) / 1000;
        car.best_lap = car.best_lap == null ? car.last_lap : Math.min(car.best_lap, car.last_lap);
        car.sector_times = splitSectors(car.last_lap);
      }
    }

    // Overall running order is by total distance covered — correct for
    // multi-class racing, where classification is independent of class.
    const order = [...cars].sort((a, b) => b.distance - a.distance);
    order.forEach((car, i) => {
      car.position = i + 1;
    });

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

    // "Director" subject pick: whichever battle is tightest right now, with
    // hysteresis so the on-camera car doesn't cut every tick.
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
      subjectSinceTick = tick;
    } else if (tick - subjectSinceTick >= SUBJECT_MIN_DWELL_TICKS && bestSlotId !== subjectSlotId) {
      const currentGap = closestGapFor(subjectSlotId);
      if (bestGap < currentGap - SUBJECT_SWITCH_MARGIN) {
        subjectSlotId = bestSlotId;
        subjectSinceTick = tick;
      }
    }

    const subjectCar = cars.find((c) => c.slot_id === subjectSlotId);
    const subjectClosest = closestGapFor(subjectSlotId);
    const intensity = Number.isFinite(subjectClosest)
      ? clamp(1 - subjectClosest / CLOSE_BATTLE_WINDOW, 0, 1)
      : 0;

    return {
      schemaVersion: "1",
      mode: "race",
      vehicles: order.map((car) => ({
        slot_id: car.slot_id,
        driver_name: car.driver_name,
        vehicle_class: car.vehicle_class,
        position: car.position,
        last_lap: car.last_lap,
        best_lap: car.best_lap,
        sector_times: car.sector_times,
      })),
      subject: {
        slot_id: subjectCar.slot_id,
        driver_name: subjectCar.driver_name,
      },
      relationship: {
        gap_ahead: gapAhead.has(subjectSlotId) ? round1(gapAhead.get(subjectSlotId)) : null,
        gap_behind: gapBehind.has(subjectSlotId) ? round1(gapBehind.get(subjectSlotId)) : null,
        battle_intensity: Math.round(intensity * 100) / 100,
      },
    };
  }

  return { step };
}

module.exports = { createSimulator };

// Zero-dependency test for the running director's battle selection (#241): retired and
// finished cars are not contenders, so they neither win battle selection nor feed the
// subject's battle_intensity. Run with `node director.test.js`.
const assert = require("node:assert/strict");
const { analyseBattle } = require("./simulate");

const car = (slot_id, distance, finish_status = 0) => ({ slot_id, distance, pace: 100, finish_status });
const DNF = 2;
const FIN = 1;

function check(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

// Order is leader-first. At pace 100, 0.01 distance = 1 s.
check("a retired car parked next to a racing car does not win the battle or rate its intensity", () => {
  const order = [car("a", 10.0), car("parked", 9.99, DNF), car("b", 9.98), car("c", 9.5), car("d", 9.4)];
  const r = analyseBattle(order, "race");
  assert.deepEqual(r.contenders.map((c) => c.slot_id), ["a", "b", "c", "d"]);
  // a and b are 2 s apart once the retiree is excluded; c-d (9 s) and b-c (48 s) are looser.
  assert.equal(r.bestSlotId, "a");
  assert.ok(Math.abs(r.bestGap - 2) < 1e-6, `bestGap ${r.bestGap}`);
  assert.ok(Math.abs(r.closestGapFor("b") - 2) < 1e-6, `closestGapFor(b) ${r.closestGapFor("b")}`);
  // Reported gaps still use the full order (the battle box names the adjacent car).
  assert.ok(Math.abs(r.gapAhead.get("b") - 1) < 1e-6);
});

check("a finished car on its cool-down lap next to a racing car does not count while anyone races", () => {
  const order = [car("fin", 10.0, FIN), car("a", 9.99), car("b", 9.0), car("c", 8.9)];
  const r = analyseBattle(order, "race");
  assert.deepEqual(r.contenders.map((c) => c.slot_id), ["a", "b", "c"]);
  assert.ok(Math.abs(r.closestGapFor("a") - 99) < 1e-6);
  assert.equal(r.bestSlotId, "b");
  assert.ok(Math.abs(r.bestGap - 10) < 1e-6, `bestGap ${r.bestGap}`);
});

check("when everyone has finished, the fallback picks among the finished cars", () => {
  const order = [car("a", 10.0, FIN), car("b", 9.99, FIN), car("c", 9.0, FIN), car("d", 8.0, DNF)];
  const r = analyseBattle(order, "race");
  assert.deepEqual(r.contenders.map((c) => c.slot_id), ["a", "b", "c"]);
  assert.ok(["a", "b"].includes(r.bestSlotId));
  assert.ok(Math.abs(r.bestGap - 1) < 1e-6, `bestGap ${r.bestGap}`);
});

check("outside the race every car is a contender", () => {
  const order = [car("a", 10.0), car("x", 9.99, DNF)];
  assert.equal(analyseBattle(order, "qualifying").contenders.length, 2);
});

// Dev-only structural validator for spec-v1 `state` payloads.
//
// Shared by validate-fixtures.js (checks the static JSON fixtures) and
// validate-simulator.js (checks live output from simulate.js) — a focused
// structural check of the required fields and their basic types/ranges from
// spec/v1/schema.json. No external deps.

function check(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

function validate(payload) {
  const errors = [];

  check(payload.schemaVersion === "1", "schemaVersion must be \"1\"", errors);
  check(typeof payload.mode === "string", "mode must be a string", errors);

  check(Array.isArray(payload.vehicles), "vehicles must be an array", errors);
  if (Array.isArray(payload.vehicles)) {
    check(payload.vehicles.length > 0, "vehicles must be non-empty", errors);
    payload.vehicles.forEach((v, idx) => {
      const at = `vehicles[${idx}]`;
      check(typeof v.slot_id === "string", `${at}.slot_id must be a string`, errors);
      check(typeof v.driver_name === "string", `${at}.driver_name must be a string`, errors);
      check(typeof v.vehicle_class === "string", `${at}.vehicle_class must be a string`, errors);
      check(
        Number.isInteger(v.position) && v.position >= 1,
        `${at}.position must be an integer >= 1`,
        errors
      );
    });
  }

  check(payload.subject && typeof payload.subject === "object", "subject must be an object", errors);
  if (payload.subject && typeof payload.subject === "object") {
    check(typeof payload.subject.slot_id === "string", "subject.slot_id must be a string", errors);
    check(typeof payload.subject.driver_name === "string", "subject.driver_name must be a string", errors);
    const slotIds = Array.isArray(payload.vehicles)
      ? payload.vehicles.map((v) => v.slot_id)
      : [];
    check(
      slotIds.includes(payload.subject.slot_id),
      `subject.slot_id "${payload.subject.slot_id}" should reference a vehicles[] slot_id`,
      errors
    );
  }

  check(
    payload.relationship && typeof payload.relationship === "object",
    "relationship must be an object",
    errors
  );
  if (payload.relationship && typeof payload.relationship === "object") {
    const bi = payload.relationship.battle_intensity;
    check(
      typeof bi === "number" && bi >= 0 && bi <= 1,
      "relationship.battle_intensity must be a number in [0, 1]",
      errors
    );
  }

  // Optional, additive `race_events` (ADR 0023): null/absent, or an array of events, each with
  // a non-blank string id (unique in the list), a known type, a driver_name, and the field its
  // type requires.
  if (payload.race_events != null) {
    check(Array.isArray(payload.race_events), "race_events must be an array or null", errors);
    if (Array.isArray(payload.race_events)) {
      const ids = new Set();
      payload.race_events.forEach((e, idx) => {
        for (const problem of raceEventProblems(e)) errors.push(`race_events[${idx}]: ${problem}`);
        if (e && typeof e.id === "string") {
          check(!ids.has(e.id), `race_events[${idx}].id "${e.id}" is not unique`, errors);
          ids.add(e.id);
        }
      });
    }
  }

  return errors;
}

const RACE_EVENT_TYPES = ["fastest_lap", "leader_change", "retirement", "penalty"];
const nonBlank = (v) => typeof v === "string" && v.trim() !== "";

/** What is wrong with one `race_events` entry (empty when it is a valid event). */
function raceEventProblems(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return ["must be an object"];
  const problems = [];
  if (!nonBlank(e.id)) problems.push("id must be a non-blank string");
  if (!RACE_EVENT_TYPES.includes(e.type)) problems.push(`type ${JSON.stringify(e.type)} is not a known type`);
  if (!nonBlank(e.driver_name)) problems.push("driver_name must be a non-blank string");
  if (e.slot_id != null && typeof e.slot_id !== "string") problems.push("slot_id must be a string");
  if (e.vehicle_class != null && typeof e.vehicle_class !== "string") problems.push("vehicle_class must be a string or null");
  if (e.detail != null && typeof e.detail !== "string") problems.push("detail must be a string");
  if (e.type === "fastest_lap" && !(typeof e.lap_time === "number" && Number.isFinite(e.lap_time) && e.lap_time > 0)) {
    problems.push("fastest_lap needs a lap_time > 0");
  }
  if (e.type === "retirement" && e.finish_status !== 2 && e.finish_status !== 3) {
    problems.push("retirement needs finish_status 2 or 3");
  }
  if (e.type === "penalty" && !nonBlank(e.penalty)) problems.push("penalty needs penalty text");
  return problems;
}

module.exports = { validate, raceEventProblems };

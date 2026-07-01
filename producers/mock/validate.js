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

  return errors;
}

module.exports = { validate };

// Wraps schema.json validation in ajv. spec/v1/schema.json is loaded directly
// and compiled as-is — field names, required-ness, and types all come from
// that single file so the harness can never drift from the spec it's meant
// to enforce.

const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const SCHEMA_PATH = path.resolve(__dirname, "..", "..", "schema.json");

function loadValidateFn() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

function formatError(err) {
  const at = err.instancePath && err.instancePath.length > 0 ? err.instancePath : "(root)";
  return `${at} ${err.message}`;
}

class StatePayloadValidator {
  constructor() {
    this._validateFn = loadValidateFn();
  }

  validate(payload) {
    const valid = this._validateFn(payload);
    if (valid) return { valid: true, errors: [] };
    return { valid: false, errors: this._validateFn.errors.map(formatError) };
  }
}

module.exports = { StatePayloadValidator, SCHEMA_PATH };

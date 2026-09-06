const test = require("node:test");
const assert = require("node:assert/strict");
const { SYSTEM_PROMPT } = require("../systemPrompt");

test("system prompt is a non-empty string", () => {
  assert.equal(typeof SYSTEM_PROMPT, "string");
  assert.ok(SYSTEM_PROMPT.length > 200);
});

test("system prompt includes the core Q500 offer facts", () => {
  assert.match(SYSTEM_PROMPT, /Q500/);
  assert.match(SYSTEM_PROMPT, /3 secciones/);
  assert.match(SYSTEM_PROMPT, /jorgegrullondev\.com/);
  assert.match(SYSTEM_PROMPT, /respond_to_visitor/);
});

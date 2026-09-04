const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_USER_MESSAGES,
  MAX_MESSAGE_LENGTH,
  validateMessages,
  countUserMessages,
  hasReachedCap,
  buildCapResponse,
} = require("../chatLogic");

test("validateMessages accepts a well-formed conversation", () => {
  const result = validateMessages([
    { role: "user", content: "hola" },
    { role: "assistant", content: "hola, ¿en qué te ayudo?" },
  ]);
  assert.deepEqual(result, { valid: true });
});

test("validateMessages rejects an empty array", () => {
  const result = validateMessages([]);
  assert.equal(result.valid, false);
});

test("validateMessages rejects a missing messages value", () => {
  const result = validateMessages(undefined);
  assert.equal(result.valid, false);
});

test("validateMessages rejects a message with an invalid role", () => {
  const result = validateMessages([{ role: "system", content: "hola" }]);
  assert.equal(result.valid, false);
});

test("validateMessages rejects empty content", () => {
  const result = validateMessages([{ role: "user", content: "" }]);
  assert.equal(result.valid, false);
});

test("validateMessages rejects a message over the character limit", () => {
  const result = validateMessages([
    { role: "user", content: "a".repeat(MAX_MESSAGE_LENGTH + 1) },
  ]);
  assert.equal(result.valid, false);
});

test("countUserMessages only counts role user", () => {
  const count = countUserMessages([
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "c" },
  ]);
  assert.equal(count, 2);
});

test("hasReachedCap is false below the limit and true at the limit", () => {
  const belowCap = Array.from({ length: MAX_USER_MESSAGES - 1 }, () => ({
    role: "user",
    content: "hola",
  }));
  const atCap = Array.from({ length: MAX_USER_MESSAGES }, () => ({
    role: "user",
    content: "hola",
  }));

  assert.equal(hasReachedCap(belowCap), false);
  assert.equal(hasReachedCap(atCap), true);
});

test("buildCapResponse always forces a handoff with a non-empty reply", () => {
  const response = buildCapResponse();
  assert.equal(response.handoff, true);
  assert.equal(typeof response.reply, "string");
  assert.ok(response.reply.length > 0);
  assert.equal(typeof response.whatsapp_summary, "string");
});

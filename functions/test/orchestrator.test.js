const test = require("node:test");
const assert = require("node:assert/strict");
const { handleChatRequest } = require("../orchestrator");

test("returns Claude's structured reply and logs the turn when under the message cap", async () => {
  const fakeReply = { reply: "¡Hola! Te cuento...", handoff: false, whatsapp_summary: "" };
  const loggedCalls = [];

  const result = await handleChatRequest({
    messages: [{ role: "user", content: "¿Qué incluye el paquete de Q500?" }],
    callClaude: async () => fakeReply,
    persistTurn: async (data) => loggedCalls.push(data),
    now: () => new Date("2026-01-01T00:00:00Z"),
  });

  assert.deepEqual(result, fakeReply);
  assert.equal(loggedCalls.length, 1);
  assert.equal(loggedCalls[0].assistantReply, fakeReply.reply);
  assert.equal(loggedCalls[0].userMessage, "¿Qué incluye el paquete de Q500?");
});

test("skips calling Claude and forces a handoff once the message cap is reached", async () => {
  const messages = Array.from({ length: 14 }, (_, i) => ({
    role: "user",
    content: `mensaje ${i + 1}`,
  }));
  let claudeCalled = false;

  const result = await handleChatRequest({
    messages,
    callClaude: async () => {
      claudeCalled = true;
      return { reply: "no debería llegar aquí", handoff: false, whatsapp_summary: "" };
    },
    persistTurn: async () => {},
    now: () => new Date(),
  });

  assert.equal(claudeCalled, false);
  assert.equal(result.handoff, true);
});

test("rejects an empty messages array before calling Claude", async () => {
  await assert.rejects(
    () =>
      handleChatRequest({
        messages: [],
        callClaude: async () => {
          throw new Error("no debería llamarse");
        },
        persistTurn: async () => {},
        now: () => new Date(),
      }),
    /messages debe ser un arreglo no vacío/
  );
});

test("still returns Claude's reply even if persisting the turn to Firestore fails", async () => {
  const fakeReply = { reply: "¡Hola!", handoff: false, whatsapp_summary: "" };

  const result = await handleChatRequest({
    messages: [{ role: "user", content: "hola" }],
    callClaude: async () => fakeReply,
    persistTurn: async () => {
      throw new Error("Firestore no disponible");
    },
    now: () => new Date(),
  });

  assert.deepEqual(result, fakeReply);
});

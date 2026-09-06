const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLeadDocUpdate } = require("../firestoreLog");

test("buildLeadDocUpdate returns both turn messages with the given timestamp", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const update = buildLeadDocUpdate({
    userMessage: "Hola, quiero una web",
    assistantReply: "¡Claro! Cuéntame más.",
    handoff: false,
    whatsappSummary: "",
    now,
  });

  assert.equal(update.lastMessageAt, now);
  assert.equal(update.handoffTriggered, false);
  assert.equal(update.whatsappSummary, null);
  assert.deepEqual(update.newMessages, [
    { role: "user", content: "Hola, quiero una web", ts: now },
    { role: "assistant", content: "¡Claro! Cuéntame más.", ts: now },
  ]);
});

test("buildLeadDocUpdate keeps the WhatsApp summary when handoff is true", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const update = buildLeadDocUpdate({
    userMessage: "Necesito un e-commerce",
    assistantReply: "Eso lo maneja Jorge directamente, te paso con él.",
    handoff: true,
    whatsappSummary: "Hola Jorge, necesito una tienda en línea.",
    now,
  });

  assert.equal(update.handoffTriggered, true);
  assert.equal(update.whatsappSummary, "Hola Jorge, necesito una tienda en línea.");
});

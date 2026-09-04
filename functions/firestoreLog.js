const { FieldValue } = require("firebase-admin/firestore");

function buildLeadDocUpdate({ userMessage, assistantReply, handoff, whatsappSummary, now }) {
  return {
    lastMessageAt: now,
    handoffTriggered: handoff,
    whatsappSummary: handoff ? whatsappSummary : null,
    newMessages: [
      { role: "user", content: userMessage, ts: now },
      { role: "assistant", content: assistantReply, ts: now },
    ],
  };
}

async function logTurn(db, sessionId, turnData) {
  const docRef = db.collection("chat_leads").doc(sessionId);
  const snapshot = await docRef.get();
  const { newMessages, ...rest } = buildLeadDocUpdate(turnData);

  const payload = {
    ...rest,
    messages: FieldValue.arrayUnion(...newMessages),
  };
  if (!snapshot.exists) {
    payload.startedAt = FieldValue.serverTimestamp();
  }

  await docRef.set(payload, { merge: true });
}

module.exports = { buildLeadDocUpdate, logTurn };

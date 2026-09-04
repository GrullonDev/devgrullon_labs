const { validateMessages, hasReachedCap, buildCapResponse } = require("./chatLogic");

async function handleChatRequest({ messages, callClaude, persistTurn, now }) {
  const validation = validateMessages(messages);
  if (!validation.valid) {
    const error = new Error(validation.reason);
    error.code = "invalid-argument";
    throw error;
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

  const result = hasReachedCap(messages) ? buildCapResponse() : await callClaude(messages);

  try {
    await persistTurn({
      userMessage: lastUserMessage.content,
      assistantReply: result.reply,
      handoff: result.handoff,
      whatsappSummary: result.whatsapp_summary,
      now: now(),
    });
  } catch (loggingError) {
    console.error("No se pudo guardar el turno en Firestore", loggingError);
  }

  return result;
}

module.exports = { handleChatRequest };

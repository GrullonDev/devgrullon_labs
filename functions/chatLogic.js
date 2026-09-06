const MAX_USER_MESSAGES = 14;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES_PER_REQUEST = 40;
const MAX_TOTAL_CHARACTERS = 40000;

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, reason: "messages debe ser un arreglo no vacío." };
  }
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return {
      valid: false,
      reason: `La conversación supera el máximo de ${MAX_MESSAGES_PER_REQUEST} mensajes.`,
    };
  }
  let totalCharacters = 0;
  for (const message of messages) {
    if (!message || (message.role !== "user" && message.role !== "assistant")) {
      return { valid: false, reason: "Cada mensaje debe tener role 'user' o 'assistant'." };
    }
    if (typeof message.content !== "string" || message.content.length === 0) {
      return { valid: false, reason: "Cada mensaje debe tener content de texto no vacío." };
    }
    if (message.content.length > MAX_MESSAGE_LENGTH) {
      return {
        valid: false,
        reason: `El mensaje supera el máximo de ${MAX_MESSAGE_LENGTH} caracteres.`,
      };
    }
    totalCharacters += message.content.length;
  }
  if (totalCharacters > MAX_TOTAL_CHARACTERS) {
    return {
      valid: false,
      reason: `La conversación supera el máximo de ${MAX_TOTAL_CHARACTERS} caracteres en total.`,
    };
  }
  return { valid: true };
}

function countUserMessages(messages) {
  return messages.filter((message) => message.role === "user").length;
}

function hasReachedCap(messages) {
  return countUserMessages(messages) >= MAX_USER_MESSAGES;
}

function buildCapResponse() {
  return {
    reply:
      "Hemos platicado bastante por aquí 🙂 Para darte una atención más completa, sigamos la conversación directo por WhatsApp con Jorge.",
    handoff: true,
    whatsapp_summary:
      "Hola Jorge, vengo del chat de tu sitio y me gustaría seguir platicando sobre mi proyecto.",
  };
}

module.exports = {
  MAX_USER_MESSAGES,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES_PER_REQUEST,
  MAX_TOTAL_CHARACTERS,
  validateMessages,
  countUserMessages,
  hasReachedCap,
  buildCapResponse,
};

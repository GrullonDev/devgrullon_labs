const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const Anthropic = require("@anthropic-ai/sdk");

const { handleChatRequest } = require("./orchestrator");
const { buildAssistantRequest, parseAssistantResponse } = require("./anthropicClient");
const { SYSTEM_PROMPT } = require("./systemPrompt");
const { logTurn } = require("./firestoreLog");

initializeApp();

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

exports.chatWithAssistant = onCall(
  { secrets: [anthropicApiKey], enforceAppCheck: true, region: "us-central1" },
  async (request) => {
    const { sessionId, messages } = request.data || {};

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new HttpsError("invalid-argument", "sessionId es requerido.");
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey.value() });
    const db = getFirestore();

    try {
      return await handleChatRequest({
        messages,
        callClaude: async (reqMessages) => {
          try {
            const apiResponse = await anthropic.messages.create(
              buildAssistantRequest(reqMessages, SYSTEM_PROMPT)
            );
            return parseAssistantResponse(apiResponse);
          } catch (claudeError) {
            console.error("Falló la llamada a Claude", claudeError);
            return {
              reply:
                "Tuve un problema técnico para responderte en este momento. Escríbele directo a Jorge:",
              handoff: true,
              whatsapp_summary:
                "Hola Jorge, intenté escribir por el chat del sitio pero tuvo un error técnico.",
            };
          }
        },
        persistTurn: (turnData) => logTurn(db, sessionId, turnData),
        now: () => new Date(),
      });
    } catch (error) {
      if (error.code === "invalid-argument") {
        throw new HttpsError("invalid-argument", error.message);
      }
      console.error("chatWithAssistant failed", error);
      throw new HttpsError("internal", "No se pudo procesar el mensaje.");
    }
  }
);

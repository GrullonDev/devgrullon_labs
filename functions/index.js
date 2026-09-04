const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const { handleChatRequest } = require("./orchestrator");
const { buildAssistantRequest, parseAssistantResponse, callDeepSeek } = require("./deepseekClient");
const { SYSTEM_PROMPT } = require("./systemPrompt");
const { logTurn } = require("./firestoreLog");

initializeApp();

const deepseekApiKey = defineSecret("DEEPSEEK_API_KEY");
const SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/i;

exports.chatWithAssistant = onCall(
  { secrets: [deepseekApiKey], enforceAppCheck: true, region: "us-central1" },
  async (request) => {
    const { sessionId, messages } = request.data || {};

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new HttpsError("invalid-argument", "sessionId es requerido.");
    }
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new HttpsError("invalid-argument", "sessionId inválido.");
    }

    const db = getFirestore();
    const sessionDocRef = db.collection("chat_leads").doc(sessionId);

    try {
      // Este read es un respaldo para el tope de costo, no una dependencia dura: si Firestore
      // no está disponible, el chat sigue funcionando con el tope basado en el arreglo del
      // cliente (igual que antes de existir este respaldo) en vez de fallar por completo.
      let sessionSnapshot = null;
      let trustedUserMessageCount;
      try {
        sessionSnapshot = await sessionDocRef.get();
        const storedMessages = sessionSnapshot.exists ? sessionSnapshot.data().messages || [] : [];
        trustedUserMessageCount = storedMessages.filter((m) => m.role === "user").length;
      } catch (readError) {
        console.error("No se pudo leer el historial de la sesión en Firestore", readError);
      }

      return await handleChatRequest({
        messages,
        trustedUserMessageCount,
        callClaude: async (reqMessages) => {
          try {
            const apiResponse = await callDeepSeek(
              buildAssistantRequest(reqMessages, SYSTEM_PROMPT),
              deepseekApiKey.value()
            );
            return parseAssistantResponse(apiResponse);
          } catch (assistantError) {
            console.error("Falló la llamada al asistente de IA", assistantError);
            return {
              reply:
                "Tuve un problema técnico para responderte en este momento. Escríbele directo a Jorge:",
              handoff: true,
              whatsapp_summary:
                "Hola Jorge, intenté escribir por el chat del sitio pero tuvo un error técnico.",
            };
          }
        },
        persistTurn: (turnData) => logTurn(db, sessionId, turnData, sessionSnapshot),
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

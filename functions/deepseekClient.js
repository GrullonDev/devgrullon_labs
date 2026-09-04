const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
const MAX_TOKENS = 1024;

const RESPONSE_TOOL = {
  type: "function",
  function: {
    name: "respond_to_visitor",
    description:
      "Formula la respuesta que se mostrará al visitante del sitio web de DevGrullon Labs.",
    parameters: {
      type: "object",
      properties: {
        reply: {
          type: "string",
          description: "Mensaje para mostrar al visitante, en español, tono cercano y honesto.",
        },
        handoff: {
          type: "boolean",
          description:
            "true si conviene ofrecerle al visitante continuar la conversación por WhatsApp con Jorge.",
        },
        whatsapp_summary: {
          type: "string",
          description:
            "Resumen breve en español para prellenar el mensaje de WhatsApp. Cadena vacía si handoff es false.",
        },
      },
      required: ["reply", "handoff", "whatsapp_summary"],
    },
  },
};

function buildAssistantRequest(messages, systemPrompt) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ],
    tools: [RESPONSE_TOOL],
    tool_choice: { type: "function", function: { name: "respond_to_visitor" } },
  };
}

function parseAssistantResponse(apiResponse) {
  const message = apiResponse.choices && apiResponse.choices[0] && apiResponse.choices[0].message;
  const toolCall = (message && message.tool_calls) || [];
  const call = toolCall.find((item) => item.function && item.function.name === "respond_to_visitor");

  if (!call) {
    throw new Error("La respuesta de DeepSeek no incluyó el bloque estructurado esperado.");
  }

  let parsedArgs;
  try {
    parsedArgs = JSON.parse(call.function.arguments);
  } catch {
    throw new Error("La respuesta estructurada de DeepSeek tiene un formato inválido.");
  }

  const { reply, handoff, whatsapp_summary } = parsedArgs;
  if (typeof reply !== "string" || typeof handoff !== "boolean") {
    throw new Error("La respuesta estructurada de DeepSeek tiene un formato inválido.");
  }
  return { reply, handoff, whatsapp_summary: whatsapp_summary || "" };
}

async function callDeepSeek(requestBody, apiKey) {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DeepSeek respondió ${response.status}: ${errorBody}`);
  }

  return response.json();
}

module.exports = { MODEL, RESPONSE_TOOL, buildAssistantRequest, parseAssistantResponse, callDeepSeek };

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

const RESPONSE_TOOL = {
  name: "respond_to_visitor",
  description:
    "Formula la respuesta que se mostrará al visitante del sitio web de DevGrullon Labs.",
  input_schema: {
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
};

function buildAssistantRequest(messages, systemPrompt) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: messages.map((message) => ({ role: message.role, content: message.content })),
    tools: [RESPONSE_TOOL],
    tool_choice: { type: "tool", name: "respond_to_visitor" },
  };
}

function parseAssistantResponse(apiResponse) {
  const toolUse = (apiResponse.content || []).find(
    (block) => block.type === "tool_use" && block.name === "respond_to_visitor"
  );
  if (!toolUse) {
    throw new Error("La respuesta de Claude no incluyó el bloque estructurado esperado.");
  }
  const { reply, handoff, whatsapp_summary } = toolUse.input;
  if (typeof reply !== "string" || typeof handoff !== "boolean") {
    throw new Error("La respuesta estructurada de Claude tiene un formato inválido.");
  }
  return { reply, handoff, whatsapp_summary: whatsapp_summary || "" };
}

module.exports = { MODEL, RESPONSE_TOOL, buildAssistantRequest, parseAssistantResponse };

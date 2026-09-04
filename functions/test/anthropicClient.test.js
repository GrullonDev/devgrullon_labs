const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAssistantRequest, parseAssistantResponse, MODEL } = require("../anthropicClient");

test("buildAssistantRequest forces the structured tool and forwards the conversation", () => {
  const request = buildAssistantRequest(
    [{ role: "user", content: "hola" }],
    "system prompt de prueba"
  );

  assert.equal(request.model, MODEL);
  assert.equal(request.system, "system prompt de prueba");
  assert.deepEqual(request.tool_choice, { type: "tool", name: "respond_to_visitor" });
  assert.deepEqual(request.messages, [{ role: "user", content: "hola" }]);
  assert.equal(request.tools[0].name, "respond_to_visitor");
});

test("parseAssistantResponse extracts the structured reply from the tool_use block", () => {
  const apiResponse = {
    content: [
      { type: "text", text: "ignorado" },
      {
        type: "tool_use",
        name: "respond_to_visitor",
        input: { reply: "¡hola!", handoff: false, whatsapp_summary: "" },
      },
    ],
  };

  const result = parseAssistantResponse(apiResponse);
  assert.deepEqual(result, { reply: "¡hola!", handoff: false, whatsapp_summary: "" });
});

test("parseAssistantResponse throws when there is no matching tool_use block", () => {
  const apiResponse = { content: [{ type: "text", text: "sin estructura" }] };
  assert.throws(() => parseAssistantResponse(apiResponse), /bloque estructurado/);
});

test("parseAssistantResponse defaults whatsapp_summary to an empty string when missing", () => {
  const apiResponse = {
    content: [
      {
        type: "tool_use",
        name: "respond_to_visitor",
        input: { reply: "ok", handoff: false },
      },
    ],
  };
  const result = parseAssistantResponse(apiResponse);
  assert.equal(result.whatsapp_summary, "");
});

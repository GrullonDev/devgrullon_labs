const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAssistantRequest, parseAssistantResponse, MODEL } = require("../deepseekClient");

test("buildAssistantRequest forces the structured tool and forwards the conversation", () => {
  const request = buildAssistantRequest(
    [{ role: "user", content: "hola" }],
    "system prompt de prueba"
  );

  assert.equal(request.model, MODEL);
  assert.deepEqual(request.messages[0], { role: "system", content: "system prompt de prueba" });
  assert.deepEqual(request.messages[1], { role: "user", content: "hola" });
  assert.deepEqual(request.tool_choice, {
    type: "function",
    function: { name: "respond_to_visitor" },
  });
  assert.equal(request.tools[0].function.name, "respond_to_visitor");
});

test("parseAssistantResponse extracts the structured reply from the tool_calls block", () => {
  const apiResponse = {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              function: {
                name: "respond_to_visitor",
                arguments: JSON.stringify({ reply: "¡hola!", handoff: false, whatsapp_summary: "" }),
              },
            },
          ],
        },
      },
    ],
  };

  const result = parseAssistantResponse(apiResponse);
  assert.deepEqual(result, { reply: "¡hola!", handoff: false, whatsapp_summary: "" });
});

test("parseAssistantResponse throws when there is no matching tool_calls entry", () => {
  const apiResponse = { choices: [{ message: { content: "sin estructura" } }] };
  assert.throws(() => parseAssistantResponse(apiResponse), /bloque estructurado/);
});

test("parseAssistantResponse throws when the arguments are not valid JSON", () => {
  const apiResponse = {
    choices: [
      {
        message: {
          tool_calls: [{ function: { name: "respond_to_visitor", arguments: "{not json" } }],
        },
      },
    ],
  };
  assert.throws(() => parseAssistantResponse(apiResponse), /formato inválido/);
});

test("parseAssistantResponse defaults whatsapp_summary to an empty string when missing", () => {
  const apiResponse = {
    choices: [
      {
        message: {
          tool_calls: [
            {
              function: {
                name: "respond_to_visitor",
                arguments: JSON.stringify({ reply: "ok", handoff: false }),
              },
            },
          ],
        },
      },
    ],
  };
  const result = parseAssistantResponse(apiResponse);
  assert.equal(result.whatsapp_summary, "");
});

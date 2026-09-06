# Asistente de IA en el Widget de WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el mini-chat estático del widget flotante de WhatsApp por una conversación real con Claude, que responde preguntas sobre la oferta de DevGrullon Labs, ofrece continuar por WhatsApp cuando conviene, y guarda cada conversación en Firestore.

**Architecture:** Una Cloud Function callable (`chatWithAssistant`) recibe el historial de mensajes del navegador, llama a la API de Claude forzando una respuesta estructurada (herramienta `respond_to_visitor`), registra el turno en Firestore, y devuelve `{ reply, handoff, whatsapp_summary }`. El frontend (nuevo `public/chat-widget.js`) reemplaza la lógica actual del widget en `public/index.js`, renderiza la conversación como burbujas, y muestra un botón "Continuar por WhatsApp" cuando `handoff` es `true`. Todo vive en el proyecto Firebase `portfolio-b302f` ya configurado, protegido con App Check.

**Tech Stack:** Firebase Cloud Functions v2 (Node.js), `@anthropic-ai/sdk`, Firebase Admin SDK (Firestore), Firebase App Check, Firebase JS SDK vía CDN (sin bundler) en el frontend, Node.js built-in test runner (`node --test`), `@firebase/rules-unit-testing` para las reglas de Firestore.

**Spec:** [docs/superpowers/specs/2026-09-03-ai-chat-assistant-design.md](../specs/2026-09-03-ai-chat-assistant-design.md)

## Global Constraints

- Modelo de Claude: `claude-haiku-4-5-20251001` — no usar otro sin decisión explícita.
- Tope de **14 mensajes de usuario por sesión**, aplicado en el servidor (no solo en el prompt).
- Límite de **2000 caracteres** por mensaje de entrada.
- Firebase App Check (`enforceAppCheck: true`) obligatorio en la función callable.
- Firestore: cero acceso de lectura/escritura directo desde el cliente — reglas deniegan todo, solo el Admin SDK (desde la función) escribe.
- Firebase JS SDK vía CDN, versión **12.18.0** (misma que ya usa el sitio para Analytics) — no introducir un bundler.
- Secreto `ANTHROPIC_API_KEY` vía Firebase Functions secrets — nunca en el repo ni en código cliente.
- Node.js **20** como runtime de Cloud Functions (`functions/package.json` → `engines.node`).
- Mensajes de commit terminan con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Antes de empezar (prerrequisitos)

No requieren nada de ti antes del Task 1 — el proyecto ya está en plan Blaze (confirmado). El plan scaffolda `functions/` desde cero en el Task 1.

---

### Task 1: Scaffold de Cloud Functions + lógica pura de validación y tope de mensajes

**Files:**
- Create: `functions/package.json`
- Create: `functions/chatLogic.js`
- Test: `functions/test/chatLogic.test.js`
- Modify: `firebase.json`

**Interfaces:**
- Produces (usado por Task 5 y Task 6): `MAX_USER_MESSAGES`, `MAX_MESSAGE_LENGTH`, `validateMessages(messages) → { valid: boolean, reason?: string }`, `countUserMessages(messages) → number`, `hasReachedCap(messages) → boolean`, `buildCapResponse() → { reply: string, handoff: true, whatsapp_summary: string }`.

- [ ] **Step 1: Crear `functions/package.json`**

```json
{
  "name": "functions",
  "description": "Cloud Functions — asistente de IA de DevGrullon Labs",
  "engines": { "node": "20" },
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "test": "node --test test/"
  },
  "dependencies": {
    "firebase-admin": "^12.6.0",
    "firebase-functions": "^6.0.1",
    "@anthropic-ai/sdk": "^0.32.1"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

Run: `cd functions && npm install`
Expected: se crea `functions/node_modules` y `functions/package-lock.json` sin errores.

- [ ] **Step 3: Escribir el test que falla**

Crear `functions/test/chatLogic.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_USER_MESSAGES,
  MAX_MESSAGE_LENGTH,
  validateMessages,
  countUserMessages,
  hasReachedCap,
  buildCapResponse,
} = require("../chatLogic");

test("validateMessages accepts a well-formed conversation", () => {
  const result = validateMessages([
    { role: "user", content: "hola" },
    { role: "assistant", content: "hola, ¿en qué te ayudo?" },
  ]);
  assert.deepEqual(result, { valid: true });
});

test("validateMessages rejects an empty array", () => {
  const result = validateMessages([]);
  assert.equal(result.valid, false);
});

test("validateMessages rejects a missing messages value", () => {
  const result = validateMessages(undefined);
  assert.equal(result.valid, false);
});

test("validateMessages rejects a message with an invalid role", () => {
  const result = validateMessages([{ role: "system", content: "hola" }]);
  assert.equal(result.valid, false);
});

test("validateMessages rejects empty content", () => {
  const result = validateMessages([{ role: "user", content: "" }]);
  assert.equal(result.valid, false);
});

test("validateMessages rejects a message over the character limit", () => {
  const result = validateMessages([
    { role: "user", content: "a".repeat(MAX_MESSAGE_LENGTH + 1) },
  ]);
  assert.equal(result.valid, false);
});

test("countUserMessages only counts role user", () => {
  const count = countUserMessages([
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "c" },
  ]);
  assert.equal(count, 2);
});

test("hasReachedCap is false below the limit and true at the limit", () => {
  const belowCap = Array.from({ length: MAX_USER_MESSAGES - 1 }, () => ({
    role: "user",
    content: "hola",
  }));
  const atCap = Array.from({ length: MAX_USER_MESSAGES }, () => ({
    role: "user",
    content: "hola",
  }));

  assert.equal(hasReachedCap(belowCap), false);
  assert.equal(hasReachedCap(atCap), true);
});

test("buildCapResponse always forces a handoff with a non-empty reply", () => {
  const response = buildCapResponse();
  assert.equal(response.handoff, true);
  assert.equal(typeof response.reply, "string");
  assert.ok(response.reply.length > 0);
  assert.equal(typeof response.whatsapp_summary, "string");
});
```

- [ ] **Step 4: Correr el test y confirmar que falla**

Run: `cd functions && node --test test/chatLogic.test.js`
Expected: FAIL — `Cannot find module '../chatLogic'`.

- [ ] **Step 5: Implementar `functions/chatLogic.js`**

```js
const MAX_USER_MESSAGES = 14;
const MAX_MESSAGE_LENGTH = 2000;

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, reason: "messages debe ser un arreglo no vacío." };
  }
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
  validateMessages,
  countUserMessages,
  hasReachedCap,
  buildCapResponse,
};
```

- [ ] **Step 6: Correr el test y confirmar que pasa**

Run: `cd functions && node --test test/chatLogic.test.js`
Expected: PASS — 9 tests, 0 fallas.

- [ ] **Step 7: Agregar `functions` y `emulators` a `firebase.json`**

Modificar `firebase.json` (agregar estas dos claves al nivel raíz, junto a `"hosting"`):

```json
{
  "hosting": {
    "target": "devgrullonlabs",
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local"
      ]
    }
  ],
  "emulators": {
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true }
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add functions/package.json functions/package-lock.json functions/chatLogic.js functions/test/chatLogic.test.js firebase.json
git commit -m "$(cat <<'EOF'
feat: scaffold de Cloud Functions y lógica de validación/tope de mensajes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Contenido del system prompt

**Files:**
- Create: `functions/systemPrompt.js`
- Test: `functions/test/systemPrompt.test.js`

**Interfaces:**
- Produces (usado por Task 6): `SYSTEM_PROMPT` (string).

- [ ] **Step 1: Escribir el test que falla**

Crear `functions/test/systemPrompt.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { SYSTEM_PROMPT } = require("../systemPrompt");

test("system prompt is a non-empty string", () => {
  assert.equal(typeof SYSTEM_PROMPT, "string");
  assert.ok(SYSTEM_PROMPT.length > 200);
});

test("system prompt includes the core Q500 offer facts", () => {
  assert.match(SYSTEM_PROMPT, /Q500/);
  assert.match(SYSTEM_PROMPT, /3 secciones/);
  assert.match(SYSTEM_PROMPT, /jorgegrullondev\.com/);
  assert.match(SYSTEM_PROMPT, /respond_to_visitor/);
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd functions && node --test test/systemPrompt.test.js`
Expected: FAIL — `Cannot find module '../systemPrompt'`.

- [ ] **Step 3: Implementar `functions/systemPrompt.js`**

```js
const SYSTEM_PROMPT = `Eres el asistente virtual de DevGrullon Labs, un servicio de desarrollo web de Jorge Grullon Marroquin, ingeniero de software. Respondes SIEMPRE en español, con un tono cercano, honesto y profesional.

# Tu identidad
Eres un asistente de inteligencia artificial, no eres Jorge. Si te preguntan si eres una persona real, acláralo con naturalidad.

# La oferta de Q500 (la oferta principal del sitio)
Incluye:
- Diseño 100% responsive (móvil, tablet y escritorio).
- Hasta 3 secciones (Inicio, Servicios, Contacto).
- Optimización básica de velocidad y SEO.
- Hosting gratuito incluido.
- Entrega rápida, sin costos ocultos.

NO incluye (esto cuesta aparte o no aplica a este paquete):
- Dominio personalizado (.com, .net, etc.) — costo adicional.
- E-commerce, bases de datos o integraciones personalizadas — esto requiere presupuesto a medida vía servicios avanzados.

Cliente ideal para el paquete de Q500: emprendedores, tiendas locales, profesionales independientes y marcas personales que quieren iniciar en el mundo digital con hasta 3 secciones.

# Servicios avanzados
Para proyectos más complejos (aplicaciones web dinámicas, e-commerce, bases de datos, integraciones personalizadas), Jorge ofrece ingeniería de software a medida bajo presupuesto personalizado. Su portafolio profesional está en jorgegrullondev.com.

# Tu objetivo
1. Responde con precisión usando SOLO la información de arriba — nunca inventes precios, plazos ni funcionalidades que no estén aquí.
2. Ayuda a la persona a decidir si el paquete de Q500 le sirve, o si necesita algo más avanzado.
3. Maneja objeciones con honestidad (precio, tiempos de entrega, confianza) y guía amablemente hacia la conversión.
4. Decide cuándo conviene ofrecer continuar por WhatsApp con Jorge (handoff=true): cuando el visitante pide algo fuera del paquete de Q500 (e-commerce, integraciones, apps a medida), cuando quiere negociar precio o condiciones, cuando pide hablar con una persona, o cuando ya está listo para avanzar y hace falta coordinar detalles concretos (fecha, pago, etc.).
5. Si handoff es true, en whatsapp_summary redacta, en primera persona como si lo escribiera el visitante, un resumen breve (1-2 frases) de lo que necesita, para que Jorge entienda el contexto de inmediato.
6. Si handoff es false, deja whatsapp_summary como cadena vacía.

Responde siempre usando la herramienta respond_to_visitor.`;

module.exports = { SYSTEM_PROMPT };
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd functions && node --test test/systemPrompt.test.js`
Expected: PASS — 2 tests, 0 fallas.

- [ ] **Step 5: Commit**

```bash
git add functions/systemPrompt.js functions/test/systemPrompt.test.js
git commit -m "$(cat <<'EOF'
feat: agregar system prompt del asistente con la oferta real del sitio

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Cliente de Anthropic — construcción de request y parseo de respuesta estructurada

**Files:**
- Create: `functions/anthropicClient.js`
- Test: `functions/test/anthropicClient.test.js`

**Interfaces:**
- Consumes: ninguna de tasks anteriores (módulo independiente).
- Produces (usado por Task 6): `MODEL` (string), `buildAssistantRequest(messages, systemPrompt) → object` (payload para `anthropic.messages.create`), `parseAssistantResponse(apiResponse) → { reply: string, handoff: boolean, whatsapp_summary: string }` (lanza `Error` si la respuesta no trae el bloque `tool_use` esperado).

- [ ] **Step 1: Escribir el test que falla**

Crear `functions/test/anthropicClient.test.js`:

```js
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
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd functions && node --test test/anthropicClient.test.js`
Expected: FAIL — `Cannot find module '../anthropicClient'`.

- [ ] **Step 3: Implementar `functions/anthropicClient.js`**

```js
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
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd functions && node --test test/anthropicClient.test.js`
Expected: PASS — 4 tests, 0 fallas.

- [ ] **Step 5: Commit**

```bash
git add functions/anthropicClient.js functions/test/anthropicClient.test.js
git commit -m "$(cat <<'EOF'
feat: construir request a Claude con salida estructurada forzada

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Registro de conversaciones en Firestore

**Files:**
- Create: `functions/firestoreLog.js`
- Test: `functions/test/firestoreLog.test.js`

**Interfaces:**
- Produces (usado por Task 6): `buildLeadDocUpdate({ userMessage, assistantReply, handoff, whatsappSummary, now }) → { lastMessageAt, handoffTriggered, whatsappSummary, newMessages: Array<{role, content, ts}> }` (pura, testeable), `logTurn(db, sessionId, turnData) → Promise<void>` (escribe en Firestore usando el Admin SDK; usa el mismo shape de `turnData` que recibe `buildLeadDocUpdate`).

- [ ] **Step 1: Escribir el test que falla**

Crear `functions/test/firestoreLog.test.js`:

```js
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
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd functions && node --test test/firestoreLog.test.js`
Expected: FAIL — `Cannot find module '../firestoreLog'`.

- [ ] **Step 3: Implementar `functions/firestoreLog.js`**

```js
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
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd functions && node --test test/firestoreLog.test.js`
Expected: PASS — 2 tests, 0 fallas.

Nota: `logTurn` en sí (la parte que toca Firestore de verdad) no tiene test automatizado aquí — se verifica manualmente con el emulador en el Task 6. Solo `buildLeadDocUpdate` (la parte pura) tiene test.

- [ ] **Step 5: Commit**

```bash
git add functions/firestoreLog.js functions/test/firestoreLog.test.js
git commit -m "$(cat <<'EOF'
feat: registrar conversaciones del asistente en Firestore

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Orquestador — une validación, tope, llamada a Claude y logging

**Files:**
- Create: `functions/orchestrator.js`
- Test: `functions/test/orchestrator.test.js`

**Interfaces:**
- Consumes: `validateMessages`, `hasReachedCap`, `buildCapResponse` de `./chatLogic` (Task 1).
- Produces (usado por Task 6): `handleChatRequest({ messages, callClaude, persistTurn, now }) → Promise<{ reply, handoff, whatsapp_summary }>`, donde `callClaude: (messages) => Promise<{reply, handoff, whatsapp_summary}>` y `persistTurn: (turnData) => Promise<void>` son inyectados por quien llama (en Task 6 serán la llamada real a Claude y a `logTurn`). Lanza un `Error` con `.code === "invalid-argument"` si `messages` no es válido.

- [ ] **Step 1: Escribir el test que falla**

Crear `functions/test/orchestrator.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { handleChatRequest } = require("../orchestrator");

test("returns Claude's structured reply and logs the turn when under the message cap", async () => {
  const fakeReply = { reply: "¡Hola! Te cuento...", handoff: false, whatsapp_summary: "" };
  const loggedCalls = [];

  const result = await handleChatRequest({
    messages: [{ role: "user", content: "¿Qué incluye el paquete de Q500?" }],
    callClaude: async () => fakeReply,
    persistTurn: async (data) => loggedCalls.push(data),
    now: () => new Date("2026-01-01T00:00:00Z"),
  });

  assert.deepEqual(result, fakeReply);
  assert.equal(loggedCalls.length, 1);
  assert.equal(loggedCalls[0].assistantReply, fakeReply.reply);
  assert.equal(loggedCalls[0].userMessage, "¿Qué incluye el paquete de Q500?");
});

test("skips calling Claude and forces a handoff once the message cap is reached", async () => {
  const messages = Array.from({ length: 14 }, (_, i) => ({
    role: "user",
    content: `mensaje ${i + 1}`,
  }));
  let claudeCalled = false;

  const result = await handleChatRequest({
    messages,
    callClaude: async () => {
      claudeCalled = true;
      return { reply: "no debería llegar aquí", handoff: false, whatsapp_summary: "" };
    },
    persistTurn: async () => {},
    now: () => new Date(),
  });

  assert.equal(claudeCalled, false);
  assert.equal(result.handoff, true);
});

test("rejects an empty messages array before calling Claude", async () => {
  await assert.rejects(
    () =>
      handleChatRequest({
        messages: [],
        callClaude: async () => {
          throw new Error("no debería llamarse");
        },
        persistTurn: async () => {},
        now: () => new Date(),
      }),
    /messages debe ser un arreglo no vacío/
  );
});

test("still returns Claude's reply even if persisting the turn to Firestore fails", async () => {
  const fakeReply = { reply: "¡Hola!", handoff: false, whatsapp_summary: "" };

  const result = await handleChatRequest({
    messages: [{ role: "user", content: "hola" }],
    callClaude: async () => fakeReply,
    persistTurn: async () => {
      throw new Error("Firestore no disponible");
    },
    now: () => new Date(),
  });

  assert.deepEqual(result, fakeReply);
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd functions && node --test test/orchestrator.test.js`
Expected: FAIL — `Cannot find module '../orchestrator'`.

- [ ] **Step 3: Implementar `functions/orchestrator.js`**

```js
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
```

Nota: `persistTurn` va envuelto en su propio `try/catch` a propósito — un fallo al guardar en Firestore se loguea pero **no** debe impedir que el visitante reciba la respuesta de Claude (así lo pide la tabla de manejo de errores del spec).

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd functions && node --test test/orchestrator.test.js`
Expected: PASS — 4 tests, 0 fallas.

- [ ] **Step 5: Correr toda la suite de `functions/` junta**

Run: `cd functions && npm test`
Expected: PASS — 21 tests en total (chatLogic + systemPrompt + anthropicClient + firestoreLog + orchestrator), 0 fallas.

- [ ] **Step 6: Commit**

```bash
git add functions/orchestrator.js functions/test/orchestrator.test.js
git commit -m "$(cat <<'EOF'
feat: orquestar validación, tope de mensajes, Claude y logging

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Cloud Function `chatWithAssistant` (wiring real)

**Files:**
- Create: `functions/index.js`

**Interfaces:**
- Consumes: `handleChatRequest` (Task 5), `buildAssistantRequest`/`parseAssistantResponse` (Task 3), `SYSTEM_PROMPT` (Task 2), `logTurn` (Task 4).
- Produces: la función exportada `chatWithAssistant`, invocable desde el frontend en Task 9 vía `httpsCallable(functions, "chatWithAssistant")`, con `data: { sessionId: string, messages: Array<{role, content}> }` y retorno `{ reply: string, handoff: boolean, whatsapp_summary: string }`.

Este archivo es la capa de "glue" con Firebase (Admin SDK, secretos, App Check) — no es razonable mockear `onCall`/`initializeApp` en un test unitario, así que este task se verifica con el emulador en el Step 3, no con `node --test`.

- [ ] **Step 1: Implementar `functions/index.js`**

```js
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
```

Nota: la llamada a Claude va envuelta en su propio `try/catch` — si Anthropic falla (timeout, error de API), se devuelve una respuesta estructurada de disculpa con `handoff: true` en vez de lanzar un error duro, tal como lo pide la tabla de manejo de errores del spec. El `try/catch` externo queda como red de seguridad solo para errores de validación (`invalid-argument`) y fallos verdaderamente inesperados.

- [ ] **Step 2: Confirmar que la función carga sin errores de sintaxis**

Run: `cd functions && node -e "require('./index.js'); console.log('ok')"`
Expected: imprime `ok` (esto no ejecuta la función, solo valida que el módulo carga — `initializeApp()` funciona sin credenciales explícitas en este contexto de smoke test local).

- [ ] **Step 3: Verificación manual con el emulador**

Esto requiere el secreto `ANTHROPIC_API_KEY` disponible localmente. Antes de este paso, tú (fuera de este plan) debes correr:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

y luego exportar el valor para el emulador según la [documentación de secretos de Firebase](https://firebase.google.com/docs/functions/config-env?gen=2nd#secret_parameters) (el emulador pide crear un archivo `functions/.secret.local` con `ANTHROPIC_API_KEY=tu_clave`; ese patrón `*.local` está en `.gitignore` en la raíz del repo, así que no se sube — la exclusión es de git, no de `firebase.json`, que solo controla qué se sube al desplegar).

Run: `firebase emulators:start --only functions,firestore`

Con el emulador corriendo, en otra terminal:

```bash
curl -X POST http://127.0.0.1:5001/portfolio-b302f/us-central1/chatWithAssistant \
  -H "Content-Type: application/json" \
  -d '{"data":{"sessionId":"test-session-1","messages":[{"role":"user","content":"¿Qué incluye el paquete de Q500?"}]}}'
```

Expected: respuesta JSON con `result.reply` mencionando el paquete de Q500, `result.handoff: false`. Revisa en `http://127.0.0.1:4000/firestore` (UI del emulador) que se creó el documento `chat_leads/test-session-1` con el turno guardado.

Nota: esta llamada por `curl` no pasa el token de App Check, así que **fallará** si `enforceAppCheck` bloquea llamadas sin token incluso en el emulador. Si eso pasa, es la señal correcta de que la protección funciona — la prueba real de extremo a extremo (con App Check) se hace desde el navegador en el Task 9. Para probar únicamente la lógica de la función sin App Check durante este paso, comenta temporalmente `enforceAppCheck: true` en tu copia local, prueba, y vuelve a activarlo antes de hacer commit.

- [ ] **Step 4: Commit**

```bash
git add functions/index.js
git commit -m "$(cat <<'EOF'
feat: exponer chatWithAssistant como Cloud Function callable

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Reglas de seguridad de Firestore

**Files:**
- Create: `firestore.rules`
- Modify: `firebase.json`
- Modify: `package.json` (raíz, ya existe con la dependencia `firebase`) — agregar devDependency
- Test: `test/firestore.rules.test.js`

**Interfaces:** ninguna (task de infraestructura/seguridad, sin código consumido por otros tasks).

- [ ] **Step 1: Agregar `@firebase/rules-unit-testing` como devDependency en el `package.json` raíz**

`package.json` (raíz) queda así:

```json
{
  "dependencies": {
    "firebase": "^12.18.0"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^3.0.4"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Escribir el test que falla**

Crear `test/firestore.rules.test.js`:

```js
const test = require("node:test");
const fs = require("node:fs");
const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "devgrullon-labs-rules-test",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test("an unauthenticated client cannot read chat_leads", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection("chat_leads").doc("session1").get());
});

test("an unauthenticated client cannot write to chat_leads", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection("chat_leads").doc("session1").set({ hola: "mundo" }));
});
```

- [ ] **Step 3: Correr el test y confirmar que falla**

Run: `firebase emulators:exec --only firestore "node --test test/firestore.rules.test.js"`
Expected: FAIL — `firestore.rules` no existe todavía (`ENOENT`).

- [ ] **Step 4: Crear `firestore.rules`**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /chat_leads/{sessionId} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 5: Agregar la configuración de `firestore` a `firebase.json`**

Agregar esta clave al nivel raíz de `firebase.json`, junto a `"hosting"`, `"functions"` y `"emulators"`:

```json
"firestore": {
  "rules": "firestore.rules"
}
```

- [ ] **Step 6: Correr el test y confirmar que pasa**

Run: `firebase emulators:exec --only firestore "node --test test/firestore.rules.test.js"`
Expected: PASS — 2 tests, 0 fallas.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules firebase.json package.json package-lock.json test/firestore.rules.test.js
git commit -m "$(cat <<'EOF'
feat: bloquear acceso directo del cliente a chat_leads en Firestore

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Inicialización de Firebase en el cliente (App, Analytics, App Check, Functions)

**Files:**
- Create: `public/firebase-init.js`
- Modify: `public/index.html`

**Interfaces:**
- Produces (usado por Task 9): `export const functions` (instancia de Firebase Functions, ya inicializada con App Check activo) desde `public/firebase-init.js`.

- [ ] **Step 1: Crear `public/firebase-init.js`**

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAnalytics,
  isSupported,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app-check.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHyhxZ0ulrmqtxrn6RUEOzTjnVTAhB2eY",
  authDomain: "portfolio-b302f.firebaseapp.com",
  projectId: "portfolio-b302f",
  storageBucket: "portfolio-b302f.firebasestorage.app",
  messagingSenderId: "399657046600",
  appId: "1:399657046600:web:a9e192773ad981592dbe7d",
  measurementId: "G-X8LWT6LPB3",
};

// Reemplaza esto con tu site key real de App Check antes de desplegar a producción:
// Firebase Console → App Check → Apps → DevGrullonLabs → registrar proveedor reCAPTCHA v3.
const RECAPTCHA_SITE_KEY = "REPLACE_WITH_YOUR_RECAPTCHA_V3_SITE_KEY";

export const app = initializeApp(firebaseConfig);

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

isSupported().then((supported) => {
  if (supported) getAnalytics(app);
});

export const functions = getFunctions(app);
```

- [ ] **Step 2: Reemplazar el script inline en `public/index.html`**

Buscar, cerca del final del `<body>`:

```html
    <script src="index.js"></script>
    <script type="module">
      import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
      import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";

      const firebaseConfig = {
        apiKey: "AIzaSyDHyhxZ0ulrmqtxrn6RUEOzTjnVTAhB2eY",
        authDomain: "portfolio-b302f.firebaseapp.com",
        projectId: "portfolio-b302f",
        storageBucket: "portfolio-b302f.firebasestorage.app",
        messagingSenderId: "399657046600",
        appId: "1:399657046600:web:a9e192773ad981592dbe7d",
        measurementId: "G-X8LWT6LPB3",
      };

      const app = initializeApp(firebaseConfig);
      isSupported().then((supported) => {
        if (supported) getAnalytics(app);
      });
    </script>
  </body>
</html>
```

Reemplazar por:

```html
    <script src="index.js"></script>
    <script type="module" src="firebase-init.js"></script>
  </body>
</html>
```

(El `<script src="chat-widget.js">` se agrega en el Task 9, junto con el resto de los cambios de `index.html` de ese task, para no dejar una referencia a un archivo que aún no existe.)

- [ ] **Step 3: Verificación manual en el navegador**

Run: `npx serve public` (o `firebase serve --only hosting`)

Abrir el sitio, abrir la consola del navegador.
Expected: sin errores. Puede aparecer una advertencia de App Check sobre un site key inválido (`REPLACE_WITH_YOUR_RECAPTCHA_V3_SITE_KEY`) — es esperado hasta que reemplaces la clave real (ver manual steps al final del plan); no debe haber errores de sintaxis ni de módulos no encontrados.

- [ ] **Step 4: Commit**

```bash
git add public/firebase-init.js public/index.html
git commit -m "$(cat <<'EOF'
feat: inicializar App Check y Functions en el cliente

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Widget de chat con IA en el frontend

**Files:**
- Create: `public/chat-widget.js`
- Modify: `public/index.html`
- Modify: `public/index.js`
- Modify: `public/index.css`

**Interfaces:**
- Consumes: `functions` desde `./firebase-init.js` (Task 8); llama a la Cloud Function `chatWithAssistant` (Task 6) con `{ sessionId, messages }` y espera `{ reply, handoff, whatsapp_summary }`.

- [ ] **Step 1: Reestructurar el widget en `public/index.html`**

Ubicar este bloque (dentro de `.whatsapp-widget`):

```html
        <div class="whatsapp-chat-body">
          <div class="whatsapp-chat-bubble">
            ¡Hola! 👋 Soy Jorge, de DevGrullon Labs. Escribe tu mensaje y te
            responderé por WhatsApp lo antes posible.
          </div>
        </div>
```

Reemplazar por:

```html
        <div class="whatsapp-chat-body" id="whatsapp-chat-messages" aria-live="polite"></div>
```

- [ ] **Step 2: Agregar la sección de privacidad y corregir el enlace del footer**

Ubicar, justo antes de `<footer class="site-footer">`, e insertar antes:

```html
    <section id="privacidad" class="privacy-note">
      <div class="privacy-note-content">
        <h2>Aviso de privacidad</h2>
        <p>
          Si usas el asistente de chat de este sitio, guardamos el contenido de esa
          conversación (los mensajes que escribes y las respuestas del asistente) para
          poder darte seguimiento y mejorar las respuestas. No se usa para otro fin ni
          se comparte con terceros. No necesitas dar tu nombre real ni ningún dato
          personal para usar el chat.
        </p>
      </div>
    </section>
```

En el footer, cambiar:

```html
          <a href="#">Aviso de privacidad</a>
```

por:

```html
          <a href="#privacidad">Aviso de privacidad</a>
```

- [ ] **Step 3: Agregar el segundo `<script type="module">` al final de `public/index.html`**

Cambiar:

```html
    <script src="index.js"></script>
    <script type="module" src="firebase-init.js"></script>
  </body>
</html>
```

por:

```html
    <script src="index.js"></script>
    <script type="module" src="firebase-init.js"></script>
    <script type="module" src="chat-widget.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Eliminar la lógica vieja del widget en `public/index.js`**

Borrar desde la línea `const WHATSAPP_FLOAT_NUMBER = "50242909548";` hasta el final del archivo (todo el bloque que maneja `whatsapp-float`, `whatsapp-chat-window`, `sendWhatsappChatMessage`, etc. — ahora vive en `chat-widget.js`). El archivo debe terminar así:

```js
const footerYear = document.getElementById("footer-year");
if (footerYear) {
  footerYear.textContent = new Date().getFullYear();
}
```

(Las líneas 1-103 del archivo original — formulario de contacto y animación del hero — se quedan sin cambios.)

- [ ] **Step 5: Crear `public/chat-widget.js`**

```js
import { functions } from "./firebase-init.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-functions.js";

const WHATSAPP_NUMBER = "50242909548";
const SESSION_STORAGE_KEY = "devgrullonlabs.chatSessionId";

const chatWithAssistant = httpsCallable(functions, "chatWithAssistant");

const whatsappFloat = document.getElementById("whatsapp-float");
const whatsappBadge = document.getElementById("whatsapp-badge");
const chatWindow = document.getElementById("whatsapp-chat-window");
const chatClose = document.getElementById("whatsapp-chat-close");
const chatForm = document.getElementById("whatsapp-chat-form");
const chatInput = document.getElementById("whatsapp-chat-input");
const chatMessages = document.getElementById("whatsapp-chat-messages");

let history = [];
let sending = false;

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

function appendBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className =
    role === "user" ? "whatsapp-chat-bubble whatsapp-chat-bubble-user" : "whatsapp-chat-bubble";
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

function appendHandoffCta(summary) {
  const cta = document.createElement("a");
  cta.className = "whatsapp-chat-cta";
  cta.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`;
  cta.target = "_blank";
  cta.rel = "noopener";
  cta.textContent = "Continuar por WhatsApp";
  chatMessages.appendChild(cta);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "whatsapp-chat-bubble whatsapp-chat-typing";
  indicator.id = "whatsapp-chat-typing";
  indicator.textContent = "Escribiendo...";
  chatMessages.appendChild(indicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById("whatsapp-chat-typing");
  if (indicator) indicator.remove();
}

function renderGreeting() {
  appendBubble(
    "assistant",
    "¡Hola! 👋 Soy el asistente virtual de DevGrullon Labs 🤖. Cuéntame qué necesitas y te ayudo, o te conecto con Jorge por WhatsApp."
  );
}

async function sendMessage(text) {
  history.push({ role: "user", content: text });
  appendBubble("user", text);
  showTypingIndicator();
  sending = true;

  try {
    const response = await chatWithAssistant({ sessionId: getSessionId(), messages: history });
    const { reply, handoff, whatsapp_summary: whatsappSummary } = response.data;
    history.push({ role: "assistant", content: reply });
    hideTypingIndicator();
    appendBubble("assistant", reply);
    if (handoff && whatsappSummary) {
      appendHandoffCta(whatsappSummary);
    }
  } catch (error) {
    console.error("chatWithAssistant failed", error);
    hideTypingIndicator();
    appendBubble("assistant", "Tuve un problema técnico para responderte. Escríbele directo a Jorge:");
    appendHandoffCta("Hola Jorge, intenté escribir por el chat del sitio pero tuvo un error.");
  } finally {
    sending = false;
  }
}

function toggleChat(forceOpen) {
  if (!chatWindow) return;
  const isHidden = chatWindow.hasAttribute("hidden");
  const open = forceOpen !== undefined ? forceOpen : isHidden;

  if (open) {
    chatWindow.removeAttribute("hidden");
    whatsappFloat.setAttribute("aria-expanded", "true");
    chatInput.focus();
    hideBadge();
    if (chatMessages.childElementCount === 0) renderGreeting();
  } else {
    chatWindow.setAttribute("hidden", "");
    whatsappFloat.setAttribute("aria-expanded", "false");
  }
}

function hideBadge() {
  if (whatsappBadge) whatsappBadge.hidden = true;
}

function showBadge() {
  if (!whatsappBadge) return;
  if (chatWindow.hasAttribute("hidden")) whatsappBadge.hidden = false;
}

if (whatsappFloat) {
  whatsappFloat.addEventListener("click", () => toggleChat());

  if (!sessionStorage.getItem("whatsappBadgeShown")) {
    setTimeout(() => {
      showBadge();
      sessionStorage.setItem("whatsappBadgeShown", "1");
    }, 4000);
  }
}

if (chatClose) {
  chatClose.addEventListener("click", () => toggleChat(false));
}

if (chatInput) {
  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = `${chatInput.scrollHeight}px`;
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (sending) return;
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    chatInput.style.height = "auto";
    sendMessage(text);
  });
}

document.addEventListener("click", (event) => {
  if (!chatWindow || chatWindow.hasAttribute("hidden")) return;
  const clickedInside = event.target.closest("#whatsapp-widget");
  if (!clickedInside) toggleChat(false);
});
```

- [ ] **Step 6: Agregar estilos nuevos en `public/index.css`**

Ubicar la regla `.whatsapp-chat-body{...}` existente y agregar, justo después del bloque `.whatsapp-chat-bubble{...}`:

```css
.whatsapp-chat-body{
  display:flex;
  flex-direction:column;
  gap:0.6rem;
}

.whatsapp-chat-bubble-user{
  align-self:flex-end;
  background:#d9fdd3;
  color:#111b21;
  border-radius:var(--radius-md) 0 var(--radius-md) var(--radius-md);
}

.whatsapp-chat-typing{
  opacity:0.6;
  font-style:italic;
}

.whatsapp-chat-cta{
  align-self:center;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:0.5rem;
  padding:0.65rem 1.1rem;
  margin-top:0.25rem;
  border-radius:var(--radius-full);
  background:var(--whatsapp);
  color:#ffffff;
  font-size:0.85rem;
  font-weight:700;
  text-decoration:none;
  box-shadow:0 4px 14px rgba(37, 211, 102, 0.35);
  transition:transform 0.15s ease;
}

.whatsapp-chat-cta:hover{
  transform:translateY(-2px);
}

.privacy-note{
  padding:2.5rem 1.5rem;
  background:var(--surface-container-low);
  border-top:1px solid var(--outline-variant);
}

.privacy-note-content{
  max-width:640px;
  margin:0 auto;
  text-align:center;
}

.privacy-note-content h2{
  font-size:1.1rem;
  font-weight:700;
  color:var(--on-surface);
  margin-bottom:0.5rem;
}

.privacy-note-content p{
  font-size:0.88rem;
  color:var(--on-surface-variant);
  line-height:1.6;
}
```

(Nota: la regla `.whatsapp-chat-body{...}` ya existente, que define `padding`, `background`, `min-height`, `max-height`, `overflow-y`, se queda igual — este step solo agrega propiedades nuevas en una segunda declaración con el mismo selector, lo cual es válido en CSS y evita reescribir la regla original.)

- [ ] **Step 7: Verificación manual de extremo a extremo**

Con el emulador de funciones/Firestore corriendo (`firebase emulators:start --only functions,firestore`) y el hosting servido localmente (`npx serve public` en otra terminal):

1. Abrir el sitio en el navegador, abrir la consola.
2. Clic en el botón flotante de WhatsApp → debe abrirse el chat con el mensaje de bienvenida del asistente (no el texto anterior "Soy Jorge").
3. Escribir "¿Qué incluye el paquete de Q500?" y enviar → debe aparecer el indicador "Escribiendo...", luego una respuesta coherente con la oferta real, sin botón de WhatsApp.
4. Escribir "Necesito una tienda en línea con pasarela de pago" → la respuesta debe traer el botón "Continuar por WhatsApp"; hacer clic debe abrir `wa.me` con un resumen coherente.
5. Verificar en la UI del emulador de Firestore (`http://127.0.0.1:4000/firestore`) que ambos turnos quedaron guardados en `chat_leads/<sessionId>`.
6. Clic en "Aviso de privacidad" del footer → debe llevar a la nueva sección de privacidad.

Expected: los 6 puntos se cumplen sin errores en la consola del navegador (aparte de la advertencia esperada de App Check por el site key de reemplazo, ver Task 8).

- [ ] **Step 8: Commit**

```bash
git add public/chat-widget.js public/index.html public/index.js public/index.css
git commit -m "$(cat <<'EOF'
feat: widget de WhatsApp habla con el asistente de IA en vez de abrir wa.me directo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Después de los tasks: pasos manuales para ti

Estos pasos no los ejecuta quien corre el plan — requieren tu cuenta/consola de Firebase y decisiones de negocio (facturación):

1. **Crear tu API key de Anthropic** en console.anthropic.com si aún no tienes una.
2. **Guardar el secreto en Firebase:**
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
3. **Registrar App Check** en Firebase Console → App Check → Apps → `DevGrullonLabs` → agregar proveedor reCAPTCHA v3 → copiar el site key.
4. **Pegar ese site key** en `public/firebase-init.js`, reemplazando `RECAPTCHA_SITE_KEY = "REPLACE_WITH_YOUR_RECAPTCHA_V3_SITE_KEY"`, y hacer commit de ese cambio.
5. **Configurar una alerta de presupuesto** en Google Cloud Billing para el proyecto `portfolio-b302f` (recomendado desde el diseño, para detectar gasto inesperado de la API de Claude).
6. **Antes de desplegar, verifica que no vas a afectar otras cosas en el proyecto `portfolio-b302f`:**
   - `firestore:rules` reemplaza TODO el ruleset de Firestore del proyecto, no solo lo de este chat. Si tu portafolio (`flutter_portfolio`) u otra app ya usa Firestore en este mismo proyecto, revisa sus reglas actuales primero (`firebase firestore:rules get` o cópialas desde la consola) y fusiónalas con `firestore.rules` de este repo antes de desplegar — no lo hagas si no estás seguro.
   - Confirma que la base de datos de Firestore ya existe en `portfolio-b302f` (Firebase Console → Firestore Database). Si no existe, créala antes de desplegar — si no existe, el chat "funciona" pero las conversaciones nunca se guardan, sin ningún error visible.
   - `firebase deploy --only functions` despliega el codebase `default` completo. Si ya tienes otras Cloud Functions en este proyecto bajo el mismo codebase, el CLI puede ofrecer *borrarlas* si no están en este repo — revisa el prompt del CLI con cuidado antes de confirmar, o corre `firebase functions:list` primero para saber qué hay.
7. **Desplegar:**
   ```bash
   firebase deploy --only functions,firestore:rules,hosting:devgrullonlabs
   ```
8. **Smoke test en producción:** repetir la verificación del Task 9 / Step 7 pero contra el sitio ya desplegado, y confirmar en la consola de Firestore que las conversaciones reales quedan guardadas.

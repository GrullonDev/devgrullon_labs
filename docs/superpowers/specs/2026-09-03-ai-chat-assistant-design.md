# Asistente de IA en el widget de WhatsApp — Diseño

## Contexto y objetivo

El sitio (`devgrullon_labs`, proyecto Firebase `portfolio-b302f`, hosting site `devgrullonlabs`) hoy tiene un widget flotante de WhatsApp (`public/index.html`, `.whatsapp-widget`) que abre un mini-chat cuyo único propósito es armar un mensaje de texto y abrir `wa.me` de inmediato (`public/index.js`).

Objetivo: reemplazar ese flujo por una conversación real con un asistente de IA (Claude) que:
1. Responda preguntas sobre la oferta de DevGrullon Labs usando la información real del sitio (Q500, transparencia, servicios avanzados).
2. Maneje objeciones y empuje amablemente hacia la conversión, sin inventar precios ni features.
3. Cuando la conversación requiera atención humana, ofrezca un botón "Continuar por WhatsApp" con un resumen pre-armado — el cliente decide cuándo dar ese paso (no hay integración con WhatsApp Business API; el cliente es quien escribe, como hoy).
4. Guarde cada conversación en Firestore para que el dueño del negocio pueda revisar leads que no llegaron a WhatsApp.

Fuera de alcance para esta v1 (decidido explícitamente durante el brainstorming):
- Notificación automática al dueño por WhatsApp/email cuando ocurre un handoff.
- Comportamiento proactivo (exit-intent, disparo por tiempo en página) — el chat solo responde cuando el visitante lo abre.
- Panel de administración propio para leer conversaciones — se revisan directo en la consola de Firebase.
- Recolección obligatoria de nombre/teléfono del visitante.

## Arquitectura

```
Visitante (navegador)
  └─ public/index.html + public/chat-widget.js
       │  llamada callable (Firebase SDK, vía CDN igual que Analytics)
       ▼
functions/ (Cloud Functions 2nd gen, Node.js)
  └─ chatWithAssistant (onCall, protegida con App Check)
       │  usa @anthropic-ai/sdk + secreto ANTHROPIC_API_KEY
       ▼
API de Anthropic (Claude Haiku 4.5)
       │
       └─ Firestore: colección chat_leads (log de cada turno)
```

Todo vive dentro del proyecto `portfolio-b302f` ya configurado (`.firebaserc`, `firebase.json` con `target: devgrullonlabs`).

## Componentes

### 1. Cloud Function `chatWithAssistant`

- Tipo: `onCall` (HTTPS Callable), Node.js 20, Cloud Functions 2nd gen.
- Entrada: `{ sessionId: string, messages: Array<{role: "user"|"assistant", content: string}> }` (el cliente manda el historial completo del turno actual; la función no necesita leer Firestore para reconstruir contexto, evita una lectura extra).
- Protección: Firebase App Check (reCAPTCHA v3) obligatorio — rechaza llamadas sin token válido.
- Validaciones server-side antes de llamar a Claude:
  - `messages` no vacío, cada `content` ≤ 2000 caracteres (evita prompts gigantes/abuso).
  - Si el conteo de mensajes con `role: "user"` en la sesión ya alcanzó **14**, no se llama a Claude: se responde directo con un mensaje de cierre + `handoff: true` y un resumen genérico. Esto es la válvula de seguridad de costo — no depende de que el modelo obedezca el prompt.
- Prompt de sistema: contiene el contenido real de la oferta (extraído de `public/index.html`: qué incluye Q500, qué no incluye, perfil de cliente ideal, cuándo redirigir a `jorgegrullondev.com`), instrucciones de tono (vendedor honesto, nunca inventa precios/features), y el contrato de salida.
- Salida forzada como JSON estructurado (usando structured output / tool-use de la API de Claude, no parseo de texto libre):
  ```json
  { "reply": "string — lo que se muestra al visitante",
    "handoff": true | false,
    "whatsapp_summary": "string | null — solo si handoff es true" }
  ```
- Efectos secundarios: escribe el turno (mensaje del usuario + respuesta del asistente) en Firestore (`chat_leads/{sessionId}`). Un fallo al escribir en Firestore se loguea pero **no** bloquea la respuesta al cliente (la conversación no debe romperse por un problema de logging).
- Modelo: `claude-haiku-4-5-20251001` (Haiku 4.5, por costo/velocidad; queda como constante fácil de cambiar si después se necesita más calidad).

### 2. Widget de chat (frontend)

- Se reutiliza el markup existente de `.whatsapp-chat-window` en `public/index.html`, pero el cuerpo (`.whatsapp-chat-body`) pasa de una sola burbuja fija a una lista de mensajes que crece (burbujas de usuario a la derecha, del asistente a la izquierda, mismo estilo visual que ya existe).
- Primer mensaje del asistente (fijo, sin llamar a la API): deja explícito que es un asistente de IA — ej. *"¡Hola! Soy el asistente virtual de DevGrullon Labs 🤖. Cuéntame qué necesitas y te ayudo, o te conecto con Jorge por WhatsApp."*
- Al enviar un mensaje: se agrega la burbuja del usuario de inmediato (optimista), se muestra un indicador de "escribiendo...", se llama a `chatWithAssistant` vía el SDK de Firebase Functions (cargado por CDN, mismo patrón que ya usamos para Analytics), y se reemplaza el indicador por la respuesta.
- `sessionId`: UUID generado en el cliente la primera vez que se abre el chat, guardado en `sessionStorage` (se pierde al cerrar la pestaña — coherente con "no guardar nada en el navegador de forma persistente").
- Si `handoff === true`: debajo del último mensaje aparece un botón persistente "Continuar por WhatsApp" (mismo estilo verde que el botón flotante actual), con `href="https://wa.me/50242909548?text=" + encodeURIComponent(whatsapp_summary)`. El input del chat sigue habilitado — el visitante puede seguir escribiendo o hacer clic cuando quiera.
- Manejo de errores (red caída, función falla, timeout): se muestra una burbuja de disculpa + el mismo botón de WhatsApp (con un mensaje genérico, no el resumen de IA), para que el visitante nunca se quede sin forma de contactar a Jorge.
- El textarea + botón de envío actuales (`whatsapp-chat-form`) se mantienen visualmente; cambia qué hace `sendWhatsappChatMessage()` — ya no abre `wa.me` directo, ahora llama a la función y renderiza la respuesta.

### 3. Firestore — colección `chat_leads`

Un documento por sesión, id = `sessionId`:

```
chat_leads/{sessionId}
  startedAt: Timestamp
  lastMessageAt: Timestamp
  handoffTriggered: boolean
  whatsappSummary: string | null
  messages: [
    { role: "user" | "assistant", content: string, ts: Timestamp }
  ]
```

Reglas de seguridad de Firestore: sin acceso de lectura/escritura directo desde el cliente (`allow read, write: if false;`) — todas las escrituras pasan por la Cloud Function usando el SDK Admin, que se salta las reglas. Esto evita que cualquiera lea leads ajenos o escriba basura directo a la base de datos.

### 4. Nota de privacidad

Ya que ahora se guardan conversaciones (texto libre que el visitante puede usar para compartir su nombre, negocio, etc.), se actualiza el enlace "Aviso de privacidad" del footer (`public/index.html`, hoy `href="#"`) para que apunte a una sección corta y real explicando qué se guarda y con qué fin (no es una política legal formal, solo transparencia mínima acorde a la sección "Transparencia total" ya existente en el sitio).

## Seguridad y control de costo

- **Firebase App Check** (reCAPTCHA v3) habilitado en el proyecto y exigido por la función — bloquea llamadas que no vengan del sitio real.
- **Tope de 14 mensajes de usuario por sesión**, aplicado en el servidor (no solo instruido en el prompt).
- **Límite de 2000 caracteres por mensaje** de entrada.
- **Secreto `ANTHROPIC_API_KEY`** vía `firebase functions:secrets:set` — nunca en el repo ni en el cliente.
- Recomendación operativa (manual, fuera de este cambio de código): configurar una alerta de presupuesto en Firebase/Google Cloud Billing.

## Manejo de errores

| Escenario | Comportamiento |
|---|---|
| Falla la llamada a Claude (timeout, error de API) | La función responde `{ reply: "mensaje de disculpa genérico", handoff: true, whatsapp_summary: "mensaje genérico de contacto" }` |
| Falla la escritura en Firestore | Se loguea el error server-side; la respuesta al cliente continúa normalmente |
| Falla la llamada callable completa (red, App Check rechaza) | El cliente muestra localmente una burbuja de error + botón de WhatsApp con mensaje genérico, sin depender del servidor |
| Sesión alcanza 14 mensajes de usuario | La función no llama a Claude; responde directo con cierre + `handoff: true` |

## Pruebas

- Desarrollo local con Firebase Emulator Suite (Functions + Firestore) antes de desplegar, para no consumir créditos reales de la API mientras se itera. Se puede usar una clave de prueba o interceptar la llamada a Anthropic con un mock durante pruebas automatizadas de la función.
- Casos a cubrir:
  1. Pregunta simple dentro de la oferta (ej. "¿qué incluye el paquete de Q500?") → respuesta correcta, `handoff: false`.
  2. Pregunta fuera de alcance (ej. "necesito una tienda en línea con pagos") → `handoff: true` con resumen coherente.
  3. Sesión que llega a 14 mensajes → se corta sin llamar a Claude, `handoff: true`.
  4. Falla simulada de Claude/red → fallback visible en el widget.
- Antes de dar el trabajo por terminado: prueba manual en el sitio ya desplegado (`https://devgrullonlabs.web.app` o dominio configurado) con mensajes reales, verificando en la consola de Firestore que las conversaciones quedan guardadas.

## Fuera de alcance / posibles fases futuras

- Notificación automática al dueño (WhatsApp Business API o email) cuando hay handoff.
- Comportamiento proactivo (exit-intent, disparo por tiempo).
- Panel de administración de leads dentro del sitio.
- Rate limiting adicional por IP (App Check + tope de mensajes ya cubren el riesgo real para el volumen actual del sitio).

import { functions } from "./firebase-init.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-functions.js";

const WHATSAPP_NUMBER = "50242909548";
const SESSION_STORAGE_KEY = "devgrullonlabs.chatSessionId";

const chatWithAssistant = httpsCallable(functions, "chatWithAssistant");

const heroCtaChat = document.getElementById("hero-cta-chat");
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

const GREETING_MESSAGE =
  "¡Hola! 👋 Soy el asistente virtual de DevGrullon Labs 🤖. Cuéntame qué necesitas y te ayudo, o te conecto con Jorge por WhatsApp.";

// El saludo se muestra en la UI pero NO entra a `history`: la API de Claude exige que el
// primer mensaje del arreglo tenga role "user", así que un saludo del asistente en la
// posición 0 haría que cada primer turno fallara con un 400.
function renderGreeting() {
  appendBubble("assistant", GREETING_MESSAGE);
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
    if (handoff) {
      appendHandoffCta(whatsappSummary || "Hola Jorge, vengo del chat de tu sitio.");
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

const HERO_CTA_MESSAGE = "Quiero mi web por Q500";

if (heroCtaChat) {
  heroCtaChat.addEventListener("click", (event) => {
    // El botón vive fuera de #whatsapp-widget, así que sin esto el listener
    // global de "clic afuera" (más abajo) cerraría el chat en el mismo clic.
    event.stopPropagation();
    const isFirstOpen = history.length === 0;
    toggleChat(true);
    if (isFirstOpen) sendMessage(HERO_CTA_MESSAGE);
  });
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

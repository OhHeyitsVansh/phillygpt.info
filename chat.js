// Basic Philly-specific scope guard for the frontend (UX only; backend enforces real guard)
const PHILLY_KEYWORDS = [
  "philly",
  "philadelphia",
  "fishtown",
  "rittenhouse",
  "old city",
  "olde city",
  "south philly",
  "south philadelphia",
  "west philly",
  "west philadelphia",
  "university city",
  "fairmount",
  "germantown",
  "mt. airy",
  "mt airy",
  "manayunk",
  "roxborough",
  "king of prussia",
  "ardmore",
  "cherry hill",
  "camden",
  "bala cynwyd",
  "conshohocken",
  "media, pa",
  "media pa",
  "delco",
  "septa"
];

const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const quickPromptsContainer = document.getElementById("quickPrompts");

const STORAGE_KEY = "phillygpt_chat_history_v1";

let isSending = false;

// Load history on start
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.error("Failed to load history", e);
    return [];
  }
}

function saveHistory(messages) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (e) {
    console.error("Failed to save history", e);
  }
}

function createMessageRow(role, text, meta) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `message-avatar ${role === "user" ? "user" : "assistant"}`;
  avatar.textContent = role === "user" ? "You" : "PG";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;

  row.appendChild(avatar);
  row.appendChild(bubble);

  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "message-meta";
    metaEl.textContent = meta;
    bubble.appendChild(document.createElement("br"));
    bubble.appendChild(metaEl);
  }

  return row;
}

function scrollToBottom() {
  if (!chatWindow) return;
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderMessages(messages) {
  chatWindow.innerHTML = "";
  messages.forEach((m) => {
    const row = createMessageRow(m.role, m.content, m.meta);
    chatWindow.appendChild(row);
  });
  scrollToBottom();
}

function addMessage(messages, role, content, meta) {
  const msg = { role, content, meta: meta || undefined };
  messages.push(msg);
  renderMessages(messages);
  saveHistory(messages);
}

function addThinkingMessage(messages) {
  const row = document.createElement("div");
  row.className = "message-row assistant";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "PG";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const label = document.createElement("span");
  label.textContent = "Thinking";
  bubble.appendChild(label);
  bubble.appendChild(document.createTextNode(" "));

  const dots = document.createElement("span");
  dots.className = "thinking-dots";
  dots.innerHTML = "<span></span><span></span><span></span>";
  bubble.appendChild(dots);

  row.appendChild(avatar);
  row.appendChild(bubble);

  row.dataset.thinking = "true";
  chatWindow.appendChild(row);
  scrollToBottom();
  return row;
}

function removeThinkingMessage() {
  const rows = chatWindow.querySelectorAll(".message-row.assistant");
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.dataset.thinking === "true") {
      chatWindow.removeChild(row);
      break;
    }
  }
}

function setSendingState(sending) {
  isSending = sending;
  sendBtn.disabled = sending;
  sendBtn.textContent = sending ? "Sending…" : "Send";
}

// Simple frontend scope hint (no hard block)
function looksOutOfScope(text) {
  const lower = text.toLowerCase();
  if (PHILLY_KEYWORDS.some((kw) => lower.includes(kw))) {
    return false;
  }
  // Very rough heuristic: if user explicitly says "not Philly"
  if (lower.includes("not philly") || lower.includes("not in philly")) return true;
  return true;
}

// Wire up quick prompts
if (quickPromptsContainer) {
  quickPromptsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const prompt = btn.getAttribute("data-prompt");
    if (!prompt) return;
    chatInput.value = prompt;
    chatInput.focus();
  });
}

// Restore chat history
const messages = loadHistory();
if (messages.length === 0) {
  addMessage(
    [],
    "assistant",
    "Yo, I’m PhillyGPT. Ask me anything about Philly and nearby suburbs, and I’ll help you plan moves that actually make sense.",
    "Scope: Philadelphia + close suburbs only."
  );
} else {
  renderMessages(messages);
}

// Submit handler
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isSending) return;
  const text = chatInput.value.trim();
  if (!text) return;

  const localMessages = loadHistory();

  // Add user message
  addMessage(localMessages, "user", text);

  // Optional in-scope hint
  if (looksOutOfScope(text)) {
    addMessage(
      localMessages,
      "assistant",
      "Heads up: PhillyGPT is only for Philadelphia and nearby suburbs. If this question is not about that area, I’ll have to steer you back.",
      "Scope reminder"
    );
  }

  chatInput.value = "";
  setSendingState(true);
  const thinkingRow = addThinkingMessage(localMessages);

  try {
    const payload = {
      messages: localMessages.map((m) => ({
        role: m.role === "assistant" || m.role === "user" ? m.role : "assistant",
        content: m.content
      }))
    };

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    removeThinkingMessage();

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => null);
      const msg =
        (errorPayload && errorPayload.error) ||
        "Something went sideways on the server. Try again in a second.";
      addMessage(localMessages, "assistant", msg, "Error");
      return;
    }

    const data = await res.json();
    const assistantText = data && data.text ? data.text : "I could not generate a response this time.";
    addMessage(localMessages, "assistant", assistantText);
  } catch (err) {
    console.error(err);
    removeThinkingMessage();
    const localMessages2 = loadHistory();
    addMessage(
      localMessages2,
      "assistant",
      "The request failed, probably a temporary network or server issue. Give it another shot in a few seconds.",
      "Network / server error"
    );
  } finally {
    setSendingState(false);
    chatInput.focus();
  }
});

// Clear chat
clearChatBtn.addEventListener("click", () => {
  const starter = [
    {
      role: "assistant",
      content:
        "Yo, I’m PhillyGPT. Ask me anything about Philly and nearby suburbs, and I’ll help you plan moves that actually make sense.",
      meta: "Scope: Philadelphia + close suburbs only."
    }
  ];
  saveHistory(starter);
  renderMessages(starter);
});

// Enter to send, Shift+Enter for new line
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event("submit"));
  }
});

/**
 * Weather badge using Open-Meteo, no API key required.
 * Philadelphia coordinates ~ 39.9526° N, -75.1652° W
 * Open-Meteo current weather API: https://api.open-meteo.com/v1/forecast
 */
async function loadWeather() {
  const tempEl = document.getElementById("weatherTemp");
  const labelEl = document.getElementById("weatherLabel");
  const iconEl = document.getElementById("weatherIcon");
  if (!tempEl || !labelEl || !iconEl) return;

  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=39.9526&longitude=-75.1652&current_weather=true";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather request failed");
    const data = await res.json();

    const cw = data.current_weather;
    if (!cw) throw new Error("No current weather");

    const tempC = cw.temperature;
    const tempF = Math.round((tempC * 9) / 5 + 32);
    const code = cw.weathercode;

    const mapped = mapWeatherCode(code);

    tempEl.textContent = `${tempF}°F`;
    labelEl.textContent = `Philly: ${mapped.label}`;
    iconEl.textContent = mapped.emoji;
  } catch (e) {
    console.error("Weather error", e);
    labelEl.textContent = "Weather unavailable";
  }
}

function mapWeatherCode(code) {
  // Mapping derived from Open-Meteo / WMO weather codes
  // 0: Clear sky
  // 1–3: Mainly clear, partly cloudy, overcast
  // 45,48: Fog
  // 51–57: Drizzle
  // 61–67: Rain
  // 71–77, 85–86: Snow
  // 80–82: Rain showers
  // 95–99: Thunderstorms
  if (code === 0) return { label: "clear skies", emoji: "☀️" };
  if (code >= 1 && code <= 3) return { label: "some clouds", emoji: "⛅" };
  if (code === 45 || code === 48) return { label: "foggy vibes", emoji: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "light drizzle", emoji: "🌦️" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { label: "rain in the mix", emoji: "🌧️" };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { label: "snow or flurries", emoji: "🌨️" };
  }
  if (code >= 95 && code <= 99) return { label: "stormy", emoji: "⛈️" };
  return { label: "mixed conditions", emoji: "🌤️" };
}

// Kick off weather
loadWeather();

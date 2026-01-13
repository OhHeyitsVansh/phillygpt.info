const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const statusLine = document.getElementById("statusLine");

const weatherValue = document.getElementById("weatherValue");
const chips = document.getElementById("chips");

const a2hsBtn = document.getElementById("a2hsBtn");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");

let isSending = false;

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function createMsg({ role, text }) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "user" : "assistant"}`;

  if (role !== "user") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "PG";
    wrap.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrap.appendChild(bubble);

  return wrap;
}

/**
 * Removes common markdown symbols so the output looks clean:
 * - strips headings, bold markers, code ticks, etc.
 * - keeps the text readable and simple
 */
function stripMarkdownLike(text) {
  let t = String(text ?? "");

  // Remove code fences and inline ticks
  t = t.replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""));
  t = t.replace(/`+/g, "");

  // Remove common markdown emphasis markers
  t = t.replace(/\*\*/g, "");
  t = t.replace(/\*/g, "");
  t = t.replace(/__/g, "");
  t = t.replace(/_/g, "");

  // Remove leading markdown bullets/headings per-line
  t = t
    .split("\n")
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/g, "")     // headings
      .replace(/^\s{0,3}>\s+/g, "")         // blockquotes
      .replace(/^\s{0,3}[-•]\s+/g, "")      // bullets
      .replace(/^\s{0,3}\d+\.\s+/g, (m) => m) // keep numbered lists as-is
    )
    .join("\n");

  // Tidy up extra blank lines
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

function setStatus(msg) {
  statusLine.textContent = msg || "";
}

function addAssistant(text) {
  const clean = stripMarkdownLike(text);
  messagesEl.appendChild(createMsg({ role: "assistant", text: clean }));
  scrollToBottom();
}

function addUser(text) {
  messagesEl.appendChild(createMsg({ role: "user", text }));
  scrollToBottom();
}

function setSending(state) {
  isSending = state;
  sendBtn.disabled = state;
  inputEl.disabled = state;
  sendBtn.textContent = state ? "Sending…" : "Send";
}

function phillyWelcome() {
  return [
    "Welcome to Philly.",
    "",
    "Tell me what you’re dealing with and where (neighborhood or nearest cross-streets helps).",
    "I can guide you through 311-style issues, parking basics, SEPTA tips, and the best next step when you’re not sure who to contact.",
  ].join("\n");
}

async function sendMessage(text) {
  const message = text.trim();
  if (!message || isSending) return;

  addUser(message);
  inputEl.value = "";
  setSending(true);
  setStatus("Thinking…");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data?.error || `Request failed (${res.status}).`;
      addAssistant(errMsg);
      return;
    }

    addAssistant(data.reply || "Sorry — I didn’t get a response.");
  } catch (err) {
    addAssistant("Network error. Please refresh and try again.");
  } finally {
    setStatus("");
    setSending(false);
  }
}

/** Weather (Philadelphia) — free, no API key via Open-Meteo */
function weatherCodeToText(code) {
  const map = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Heavy showers",
    82: "Violent showers",
    95: "Thunderstorm",
    96: "Thunder + hail",
    99: "Severe thunder + hail",
  };
  return map[code] || "Weather";
}

async function loadWeather() {
  try {
    // Philadelphia coordinates
    const lat = 39.9526;
    const lon = -75.1652;

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,wind_speed_10m` +
      `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=America%2FNew_York`;

    const res = await fetch(url);
    const data = await res.json();

    const cur = data?.current;
    if (!cur) throw new Error("No weather");

    const temp = Math.round(cur.temperature_2m);
    const wcode = cur.weather_code;
    const wind = Math.round(cur.wind_speed_10m);
    const desc = weatherCodeToText(wcode);

    weatherValue.textContent = `${temp}°F • ${desc} • Wind ${wind} mph`;
  } catch {
    weatherValue.textContent = "Unavailable";
  }
}

/** Add-to-home-screen modal */
function openModal() {
  modalBackdrop.hidden = false;
}
function closeModal() {
  modalBackdrop.hidden = true;
}

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
modalClose.addEventListener("click", closeModal);
a2hsBtn.addEventListener("click", openModal);

/** Events */
clearBtn.addEventListener("click", () => {
  messagesEl.innerHTML = "";
  addAssistant(phillyWelcome());
});

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

/** Enter sends, Shift+Enter newline */
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

/** Quick question chips */
chips.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-q]");
  if (!btn) return;
  const q = btn.getAttribute("data-q");
  sendMessage(q);
});

/** Init */
addAssistant(phillyWelcome());
loadWeather();
setInterval(loadWeather, 10 * 60 * 1000); // refresh every 10 minutes

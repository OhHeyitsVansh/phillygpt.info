// /app.js
const messagesEl = document.getElementById("messages");
const composer = document.getElementById("composer");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const chipsEl = document.getElementById("chips");

const weatherValueEl = document.getElementById("weatherValue");
const weatherMetaEl = document.getElementById("weatherMeta");

const CHAT_KEY = "phillygpt_simple_chat_v1";
const WEATHER_KEY = "phillygpt_simple_weather_v1";
const WEATHER_TTL_MS = 10 * 60 * 1000;

function sanitizePlainText(text) {
  let t = String(text ?? "");
  t = t.replace(/`+/g, "");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/\*\*/g, "").replace(/\*/g, "");
  t = t.replace(/__/g, "").replace(/_/g, "");
  t = t.replace(/^\s{0,3}>\s?/gm, "");
  t = t.replace(/^\s*[-•]\s+/gm, "");
  t = t.replace(/[•#]/g, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(role, text) {
  const row = document.createElement("div");
  row.className = `row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = sanitizePlainText(text);

  if (role !== "user") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "PG";
    row.appendChild(avatar);
  }

  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollToBottom();
}

function setBusy(busy) {
  sendBtn.disabled = busy;
  inputEl.disabled = busy;
}

function loadChat() {
  const raw = localStorage.getItem(CHAT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveChat(chat) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(chat));
}

function renderChat(chat) {
  messagesEl.innerHTML = "";
  for (const m of chat) addMessage(m.role, m.content);
}

function autoGrow() {
  inputEl.style.height = "0px";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}

function seedIntroIfEmpty() {
  const existing = loadChat();
  if (existing && existing.length) {
    renderChat(existing);
    return;
  }

  const intro =
    "Welcome to Philly GPT.\n\n" +
    "Tell me what you’re trying to do, and add your neighborhood or closest cross streets if it matters. " +
    "I’ll give you practical next steps: who to contact, what details to collect, and what to try next.\n\n" +
    "Examples: Streetlight out, parking ticket question, SEPTA planning, or reporting a city issue.";

  const chat = [{ role: "assistant", content: intro }];
  saveChat(chat);
  renderChat(chat);
}

async function sendMessage(userText) {
  const text = userText.trim();
  if (!text) return;

  const chat = loadChat() ?? [];
  chat.push({ role: "user", content: text });
  saveChat(chat);

  addMessage("user", text);
  inputEl.value = "";
  autoGrow();
  setBusy(true);

  addMessage("assistant", "One moment…");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat }),
    });

    const data = await res.json().catch(() => ({}));

    // remove placeholder
    messagesEl.lastChild?.remove();

    if (!res.ok) {
      addMessage("assistant", data?.error || "Something went wrong. Please try again.");
      return;
    }

    const reply = data?.reply || "I didn’t get a response. Please try again.";
    chat.push({ role: "assistant", content: reply });
    saveChat(chat);
    addMessage("assistant", reply);
  } catch {
    messagesEl.lastChild?.remove();
    addMessage("assistant", "Network error. Please check your connection and try again.");
  } finally {
    setBusy(false);
    inputEl.focus();
  }
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

inputEl.addEventListener("input", autoGrow);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

clearBtn.addEventListener("click", () => {
  localStorage.removeItem(CHAT_KEY);
  seedIntroIfEmpty();
  inputEl.focus();
});

chipsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-q]");
  if (!btn) return;
  inputEl.value = btn.getAttribute("data-q") || "";
  autoGrow();
  inputEl.focus();
});

// Weather (Philadelphia) via Open-Meteo (no key)
function weatherCodeToText(code) {
  const map = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Showers",
    81: "Showers",
    82: "Heavy showers",
    95: "Thunderstorm",
  };
  return map[code] || "Weather";
}

async function loadWeather() {
  try {
    const cachedRaw = localStorage.getItem(WEATHER_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (Date.now() - cached.ts < WEATHER_TTL_MS) {
        weatherValueEl.textContent = cached.value;
        weatherMetaEl.textContent = cached.meta || "";
        return;
      }
    }

    const url =
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=39.9526&longitude=-75.1652" +
      "&current=temperature_2m,weather_code,wind_speed_10m" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph" +
      "&timezone=America%2FNew_York";

    const res = await fetch(url);
    const j = await res.json();

    const temp = Math.round(j?.current?.temperature_2m);
    const code = j?.current?.weather_code;
    const wind = Math.round(j?.current?.wind_speed_10m);

    const desc = weatherCodeToText(code);
    const value = `${temp}°F • ${desc}`;
    const meta = `Wind: ${wind} mph`;

    weatherValueEl.textContent = value;
    weatherMetaEl.textContent = meta;

    localStorage.setItem(WEATHER_KEY, JSON.stringify({ ts: Date.now(), value, meta }));
  } catch {
    weatherValueEl.textContent = "Unavailable";
    weatherMetaEl.textContent = "";
  }
}

seedIntroIfEmpty();
autoGrow();
loadWeather();
setInterval(loadWeather, WEATHER_TTL_MS);

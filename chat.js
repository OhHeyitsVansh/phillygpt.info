// /chat.js
const $ = (id) => document.getElementById(id);

const messagesEl = $("messages");
const formEl = $("chatForm");
const inputEl = $("input");
const sendBtn = $("sendBtn");
const clearBtn = $("clearBtn");
const weatherValueEl = $("weatherValue");
const chipsEl = $("chips");

const STORAGE_KEY = "phillygpt_tourguide_chat_v1";
const WEATHER_TTL_MS = 10 * 60 * 1000;
const WEATHER_CACHE_KEY = "phillygpt_weather_cache_v1";

function normalizeOutput(text) {
  let t = String(text ?? "");

  // Remove markdown clutter
  t = t.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```[\w-]*\n?/g, "").replace(/```/g, "").trim()
  );
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
  t = t.replace(/__(.*?)__/g, "$1").replace(/_(.*?)_/g, "$1");
  t = t.replace(/^\s*[-*•]\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");
  t = t.replace(/[•#]/g, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role === "user" ? "me" : "bot"}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "You" : "PG";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  scrollToBottom();
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChat(history) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {}
}

function seedWelcome() {
  addMessage(
    "assistant",
    "Welcome to Philly.\n\nTell me what you’re into (food, history, museums, nightlife), how much time you have, and where you’re starting from. I’ll give you a simple plan with the best next stops."
  );
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

function buildSystem() {
  return {
    role: "system",
    content:
      "You are Philly GPT, a friendly tour guide for Philadelphia. Output must be plain text only with no markdown, no hashtags, no asterisks, and no bullet symbols. Keep answers short and clear. Give 3 to 6 great options with neighborhood context and practical tips. Offer a simple mini itinerary. Ask one short follow-up question only if needed.",
  };
}

async function sendToAPI(history) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: history }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

async function handleSend(userText) {
  const text = userText.trim();
  if (!text) return;

  addMessage("user", text);

  const saved = loadSaved();
  const history = [buildSystem(), ...saved, { role: "user", content: text }];

  sendBtn.disabled = true;
  addMessage("assistant", "One sec — planning that for you…");

  try {
    const data = await sendToAPI(history);

    // remove placeholder
    messagesEl.removeChild(messagesEl.lastElementChild);

    const reply = normalizeOutput(data?.reply || "");
    addMessage("assistant", reply || "No response returned. Please try again.");

    const newSaved = [...saved, { role: "user", content: text }, { role: "assistant", content: reply }].slice(-24);
    saveChat(newSaved);
  } catch (e) {
    messagesEl.removeChild(messagesEl.lastElementChild);
    addMessage("assistant", `Sorry — ${e.message}`);
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

// Weather (Philadelphia) via Open-Meteo (no key)
function weatherCodeToText(code) {
  const c = Number(code);
  if (c === 0) return "Clear";
  if (c === 1 || c === 2 || c === 3) return "Cloudy";
  if (c === 45 || c === 48) return "Fog";
  if (c === 51 || c === 53 || c === 55 || c === 56 || c === 57) return "Drizzle";
  if (c === 61 || c === 63 || c === 65 || c === 66 || c === 67) return "Rain";
  if (c === 71 || c === 73 || c === 75 || c === 77) return "Snow";
  if (c === 80 || c === 81 || c === 82) return "Showers";
  if (c === 95 || c === 96 || c === 99) return "Thunderstorms";
  return "Conditions";
}

function loadWeatherCache() {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c?.ts || !c?.value) return null;
    if (Date.now() - c.ts > WEATHER_TTL_MS) return null;
    return c.value;
  } catch {
    return null;
  }
}

function saveWeatherCache(value) {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), value }));
  } catch {}
}

async function loadWeather() {
  const cached = loadWeatherCache();
  if (cached) {
    weatherValueEl.textContent = cached;
    return;
  }

  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=39.9526&longitude=-75.1652&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York";
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    const temp = Math.round(data?.current?.temperature_2m);
    const wind = Math.round(data?.current?.wind_speed_10m);
    const code = data?.current?.weather_code;
    const desc = weatherCodeToText(code);

    const value = `${temp}°F · ${desc} · Wind ${wind} mph`;
    weatherValueEl.textContent = value;
    saveWeatherCache(value);
  } catch {
    weatherValueEl.textContent = "Weather unavailable";
  }
}

// Events
clearBtn.addEventListener("click", () => {
  messagesEl.innerHTML = "";
  saveChat([]);
  seedWelcome();
});

inputEl.addEventListener("input", () => autoResize(inputEl));

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value;
  inputEl.value = "";
  autoResize(inputEl);
  handleSend(text);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

chipsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-prompt]");
  if (!btn) return;
  inputEl.value = btn.getAttribute("data-prompt") || "";
  autoResize(inputEl);
  inputEl.focus();
});

// Boot
(function init() {
  const saved = loadSaved();

  messagesEl.innerHTML = "";
  seedWelcome();

  for (const m of saved) {
    if (m?.role === "user") addMessage("user", m.content);
    if (m?.role === "assistant") addMessage("assistant", normalizeOutput(m.content));
  }

  autoResize(inputEl);
  loadWeather();
  setInterval(loadWeather, WEATHER_TTL_MS);
})();

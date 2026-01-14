const API_ENDPOINT = "/api/chat";
const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const PHILLY_COORDS = { latitude: 39.9526, longitude: -75.1652 };
const STORAGE_KEY = "phillygpt_chat_history_v1";

const messagesEl = document.getElementById("chat-messages");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-button");
const clearBtn = document.getElementById("clear-chat");
const typingEl = document.getElementById("typing-indicator");
const weatherTextEl = document.getElementById("weather-text");
const weatherIconEl = document.getElementById("weather-icon");
const chipButtons = document.querySelectorAll(".chip");

let chatHistory = [];

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
  } catch (e) {
    // ignore storage errors
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      chatHistory = parsed;
      chatHistory.forEach(msg => appendMessage(msg.role, msg.content, false));
    }
  } catch (e) {
    // ignore parse errors
  }
}

function scrollToBottom() {
  if (!messagesEl) return;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function createMessageRow(role, content) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role}`;
  avatar.textContent = role === "user" ? "You" : "PG";

  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = content;

  if (role === "assistant") {
    row.appendChild(avatar);
    row.appendChild(bubble);
  } else {
    row.appendChild(bubble);
    row.appendChild(avatar);
  }
  return row;
}

function appendMessage(role, content, persist = true) {
  const row = createMessageRow(role, content);
  messagesEl.appendChild(row);
  if (persist) {
    chatHistory.push({ role, content });
    saveHistory();
  }
  scrollToBottom();
}

function setTypingVisible(visible) {
  typingEl.style.display = visible ? "inline-flex" : "none";
}

async function fetchWeather() {
  try {
    const params = new URLSearchParams({
      latitude: String(PHILLY_COORDS.latitude),
      longitude: String(PHILLY_COORDS.longitude),
      current: "temperature_2m,wind_speed_10m,weather_code",
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      timezone: "America/New_York"
    });
    const res = await fetch(`${WEATHER_ENDPOINT}?${params.toString()}`);
    if (!res.ok) throw new Error("Weather request failed");
    const data = await res.json();

    const current = (data && data.current) || {};
    const temp = typeof current.temperature_2m === "number" ? Math.round(current.temperature_2m) : null;
    const wind = typeof current.wind_speed_10m === "number" ? Math.round(current.wind_speed_10m) : null;
    const code = current.weather_code;

    const description = mapWeatherCodeToText(code);
    const icon = mapWeatherCodeToIcon(code);

    const tempText = temp !== null ? `${temp}°F` : "—°F";
    const windText = wind !== null ? `Wind ${wind} mph` : "Wind — mph";
    const mainText = description || "Conditions unavailable";

    weatherTextEl.textContent = `${tempText} · ${mainText} · ${windText}`;
    weatherIconEl.textContent = icon;
  } catch (e) {
    weatherTextEl.textContent = "Philadelphia weather unavailable";
    weatherIconEl.textContent = "ℹ️";
  }
}

function mapWeatherCodeToText(code) {
  if (code === undefined || code === null) return "";
  if (code === 0) return "Clear";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 67) return "Drizzle or rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 95) return "Thunderstorms";
  return "Conditions mixed";
}

function mapWeatherCodeToIcon(code) {
  if (code === undefined || code === null) return "⛅";
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code >= 45 && code <= 48) return "🌫️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 95) return "⛈️";
  return "⛅";
}

function buildPayloadFromHistory(newUserMessage) {
  const combined = chatHistory.concat({ role: "user", content: newUserMessage });
  const maxMessages = 40;
  const trimmed = combined.slice(-maxMessages);
  return { messages: trimmed };
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  appendMessage("user", trimmed);

  const payload = buildPayloadFromHistory(trimmed);

  setTypingVisible(true);
  sendBtn.disabled = true;

  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorPayload = await safeParseJSON(res);
      const display = errorPayload && errorPayload.error
        ? `Sorry, something went wrong on the server: ${errorPayload.error}`
        : "Sorry, something went wrong reaching the server.";
      appendMessage("assistant", display);
      return;
    }

    const data = await res.json();
    const text = typeof data.text === "string" && data.text.trim()
      ? data.text.trim()
      : "Sorry, I could not generate a response this time.";
    appendMessage("assistant", text);
  } catch (e) {
    appendMessage("assistant", "Sorry, there was a network error talking to the PhillyGPT server.");
  } finally {
    setTypingVisible(false);
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

async function safeParseJSON(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function handleFormSubmit(event) {
  event.preventDefault();
  const value = inputEl.value;
  if (!value.trim()) return;
  inputEl.value = "";
  sendMessage(value);
}

function handleKeyDown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    formEl.requestSubmit();
  }
}

function handleClearChat() {
  chatHistory = [];
  saveHistory();
  messagesEl.innerHTML = "";
}

function handleChipClick(event) {
  const text = event.currentTarget.getAttribute("data-prompt");
  if (!text) return;
  inputEl.value = text;
  inputEl.focus();
}

function ensureIntroMessage() {
  if (chatHistory.length > 0) return;
  const intro = "Hey, welcome to PhillyGPT. Tell me what kind of Philadelphia day you want, and I will help you plan it.";
  appendMessage("assistant", intro, true);
}

document.addEventListener("DOMContentLoaded", () => {
  loadHistory();
  ensureIntroMessage();
  fetchWeather();

  formEl.addEventListener("submit", handleFormSubmit);
  inputEl.addEventListener("keydown", handleKeyDown);
  clearBtn.addEventListener("click", handleClearChat);
  chipButtons.forEach(btn => btn.addEventListener("click", handleChipClick));
});

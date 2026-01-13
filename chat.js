const $ = (id) => document.getElementById(id);

const messagesEl = $("messages");
const formEl = $("chatForm");
const inputEl = $("input");
const sendBtn = $("sendBtn");
const clearBtn = $("clearBtn");
const weatherValueEl = $("weatherValue");
const chipsEl = $("chips");

const STORAGE_KEY = "phillygpt_tourguide_chat_v1";

function escapeText(s) {
  // Keeps output clean; prevents accidental HTML rendering
  return (s ?? "").toString();
}

function normalizeModelOutput(text) {
  // Remove markdown-y clutter to keep UI clean:
  // - headings, bold markers, bullets, code fences
  let t = (text ?? "").toString();

  // Remove code fences
  t = t.replace(/```[\s\S]*?```/g, (block) => {
    // Keep content without fences
    return block.replace(/```[\w-]*\n?/g, "").replace(/```/g, "").trim();
  });

  // Remove markdown headings like ### Title
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Remove bold/italic markers
  t = t.replace(/\*\*(.*?)\*\*/g, "$1");
  t = t.replace(/\*(.*?)\*/g, "$1");
  t = t.replace(/__(.*?)__/g, "$1");
  t = t.replace(/_(.*?)_/g, "$1");

  // Remove leading list markers like "- ", "* ", "• "
  t = t.replace(/^\s*[-*•]\s+/gm, "");

  // Remove numbered list formatting "1. " but keep text
  t = t.replace(/^\s*\d+\.\s+/gm, "");

  // Collapse excessive blank lines
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
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
  bubble.textContent = escapeText(text);

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);

  scrollToBottom();
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveChat(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {}
}

function clearChat() {
  messagesEl.innerHTML = "";
  saveChat([]);
  seedWelcome();
}

function seedWelcome() {
  addMessage(
    "assistant",
    "Welcome to Philly.\n\nTell me what you’re into (food, history, art, nightlife), how much time you have, and where you’re starting from. I’ll give you a simple plan with the best next stops and what to do at each."
  );
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

async function sendToAPI(history) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: history }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function buildSystemPrompt() {
  return {
    role: "system",
    content:
      "You are Philly GPT, a friendly tour guide for Philadelphia. Keep answers clean and readable with no markdown formatting. Do not use hashtags, asterisks, or bullet symbols. Write in short paragraphs with clear recommendations. Include practical details: approximate neighborhoods, walking/subway suggestions, and what to order or look for. If user is vague, ask one short follow-up question. Avoid sensitive personal data.",
  };
}

async function handleSend(userText) {
  const text = userText.trim();
  if (!text) return;

  // Render user message
  addMessage("user", text);

  // Build history for the API
  const saved = loadSaved() || [];
  const history = [
    buildSystemPrompt(),
    ...saved,
    { role: "user", content: text },
  ];

  // UI lock
  sendBtn.disabled = true;

  // Placeholder bot bubble
  const typing = "One sec — planning that for you…";
  addMessage("assistant", typing);

  try {
    const data = await sendToAPI(history);

    // Replace placeholder by removing last assistant bubble and adding final
    messagesEl.removeChild(messagesEl.lastElementChild);

    const clean = normalizeModelOutput(data?.reply || "");
    addMessage("assistant", clean || "I didn’t get a response back. Try again.");

    // Save (without system message)
    const newSaved = [
      ...(saved || []),
      { role: "user", content: text },
      { role: "assistant", content: clean || "" },
    ].slice(-24); // keep it light
    saveChat(newSaved);
  } catch (e) {
    messagesEl.removeChild(messagesEl.lastElementChild);
    addMessage("assistant", `Sorry — ${e.message}`);
  } finally {
    sendBtn.disabled = false;
  }
}

async function loadWeather() {
  try {
    // Free endpoint from open-meteo (no key)
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=39.9526&longitude=-75.1652&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York";
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    const temp = Math.round(data?.current?.temperature_2m);
    const wind = Math.round(data?.current?.wind_speed_10m);
    const code = data?.current?.weather_code;

    const desc = weatherCodeToText(code);
    weatherValueEl.textContent = `${temp}°F · ${desc} · Wind ${wind} mph`;
  } catch {
    weatherValueEl.textContent = "Weather unavailable";
  }
}

function weatherCodeToText(code) {
  // Open-Meteo weather codes (simplified)
  const c = Number(code);
  if ([0].includes(c)) return "Clear";
  if ([1, 2, 3].includes(c)) return "Cloudy";
  if ([45, 48].includes(c)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(c)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(c)) return "Rain";
  if ([71, 73, 75, 77].includes(c)) return "Snow";
  if ([80, 81, 82].includes(c)) return "Showers";
  if ([95, 96, 99].includes(c)) return "Thunderstorms";
  return "Conditions";
}

// Wire up UI
clearBtn.addEventListener("click", clearChat);

inputEl.addEventListener("input", () => autoResizeTextarea(inputEl));

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value;
  inputEl.value = "";
  autoResizeTextarea(inputEl);
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
  const prompt = btn.getAttribute("data-prompt") || "";
  inputEl.value = prompt;
  autoResizeTextarea(inputEl);
  inputEl.focus();
});

// Boot
(function init() {
  const saved = loadSaved() || [];
  messagesEl.innerHTML = "";
  if (saved.length === 0) {
    seedWelcome();
  } else {
    seedWelcome();
    for (const m of saved) {
      if (m?.role === "user") addMessage("user", m.content);
      if (m?.role === "assistant") addMessage("assistant", normalizeModelOutput(m.content));
    }
  }

  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000); // update every 10 minutes
})();

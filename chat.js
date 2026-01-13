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
  i

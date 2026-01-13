const msgs = document.getElementById("msgs");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const clearBtn = document.getElementById("clear");
const chips = document.getElementById("chips");
const weatherEl = document.getElementById("weather");

let history = [];
let busy = false;

function add(role, text) {
  const row = document.createElement("div");
  row.className = "msg" + (role === "user" ? " me" : "");

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = role === "user" ? "ME" : "PG";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  if (role !== "user") row.appendChild(badge);
  row.appendChild(bubble);

  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
  return bubble;
}

function setBusy(on) {
  busy = on;
  sendBtn.disabled = on;
  input.disabled = on;
}

function intro() {
  add(
    "assistant",
    "Yo—welcome to Philly. Tell me what’s up (and your neighborhood/cross-streets if you’ve got them) and I’ll point you to the right next steps—311, parking rules, SEPTA, or the exact city page to use. If someone’s in danger, call 911."
  );
}

function reset() {
  history = [];
  msgs.innerHTML = "";
  intro();
}

async function send() {
  const text = input.value.trim();
  if (!text || busy) return;

  input.value = "";
  add("user", text);
  history.push({ role: "user", content: text });

  setBusy(true);
  const bubble = add("assistant", "Working on it…");

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(-12) }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      bubble.textContent = "Error: " + (data.error || `Request failed (${r.status})`);
      setBusy(false);
      return;
    }

    bubble.textContent = (data.reply || "").trim() || "No response came back. Try again.";
    history.push({ role: "assistant", content: bubble.textContent });
  } catch (e) {
    bubble.textContent = "Error: " + (e?.message || "Network error");
  } finally {
    setBusy(false);
  }
}

async function loadWeather() {
  try {
    const r = await fetch("/api/weather", { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "weather error");
    weatherEl.innerHTML = `Weather: <b>${data.tempF}°F</b> · ${data.summary} · <span style="opacity:.7">Wind ${data.windMph} mph</span>`;
  } catch {
    weatherEl.textContent = "Weather: Unavailable";
  }
}

sendBtn.addEventListener("click", send);
clearBtn.addEventListener("click", reset);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

chips.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-q]");
  if (!b) return;
  input.value = b.getAttribute("data-q");
  input.focus();
});

reset();
loadWeather();
setInterval(loadWeather, 10 * 60 * 1000);

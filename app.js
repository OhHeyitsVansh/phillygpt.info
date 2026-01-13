// ===== Elements =====
const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const clearBtn = document.getElementById("clear");

const phillyTimeEl = document.getElementById("phillyTime");
const phillyWeatherEl = document.getElementById("phillyWeather");
const weatherMetaEl = document.getElementById("weatherMeta");

// ===== Helpers: Chat UI =====
function addBot(text) {
  const row = document.createElement("div");
  row.className = "msg bot";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "PG";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  row.appendChild(avatar);
  row.appendChild(bubble);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function addUser(text) {
  const row = document.createElement("div");
  row.className = "msg user";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function addTyping() {
  const row = document.createElement("div");
  row.className = "msg bot";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "PG";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `<span class="typing"><span class="tDot"></span><span class="tDot"></span><span class="tDot"></span></span>`;

  row.appendChild(avatar);
  row.appendChild(bubble);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
  return row;
}

function setDisabled(disabled) {
  sendBtn.disabled = disabled;
  inputEl.disabled = disabled;
}

// ===== Weather/Time Banner =====
const PHILLY_TZ = "America/New_York";
const PHILLY_LAT = 39.9526;
const PHILLY_LON = -75.1652;

function formatPhillyTime(d = new Date()) {
  // Example: "1:42 PM"
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHILLY_TZ,
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function tickClock() {
  phillyTimeEl.textContent = formatPhillyTime();
}

function weatherCodeToText(code) {
  // Based on Open-Meteo weather codes
  // https://open-meteo.com/en/docs (Weather code table)
  if (code === 0) return "Clear";
  if ([1,2,3].includes(code)) return "Cloudy";
  if ([45,48].includes(code)) return "Fog";
  if ([51,53,55].includes(code)) return "Drizzle";
  if ([56,57].includes(code)) return "Freezing drizzle";
  if ([61,63,65].includes(code)) return "Rain";
  if ([66,67].includes(code)) return "Freezing rain";
  if ([71,73,75].includes(code)) return "Snow";
  if (code === 77) return "Snow grains";
  if ([80,81,82].includes(code)) return "Showers";
  if ([95,96,99].includes(code)) return "Thunderstorm";
  return "Weather";
}

function weatherCodeToEmoji(code) {
  if (code === 0) return "☀️";
  if ([1,2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45,48].includes(code)) return "🌫️";
  if ([51,53,55,56,57].includes(code)) return "🌦️";
  if ([61,63,65,66,67,80,81,82].includes(code)) return "🌧️";
  if ([71,73,75,77].includes(code)) return "❄️";
  if ([95,96,99].includes(code)) return "⛈️";
  return "🌡️";
}

async function updateWeather() {
  try {
    // Open-Meteo Forecast API (no key needed for non-commercial use)
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${PHILLY_LAT}&longitude=${PHILLY_LON}` +
      `&current=temperature_2m,weather_code,wind_speed_10m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph` +
      `&timezone=${encodeURIComponent(PHILLY_TZ)}`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("Weather request failed");

    const data = await r.json();
    const cur = data?.current;

    const temp = Math.round(cur?.temperature_2m);
    const code = cur?.weather_code;
    const wind = Math.round(cur?.wind_speed_10m);

    const label = weatherCodeToText(code);
    const emoji = weatherCodeToEmoji(code);

    if (Number.isFinite(temp) && typeof code === "number") {
      phillyWeatherEl.textContent = `${emoji} ${temp}°F • ${label}`;
      weatherMetaEl.textContent = `Wind: ${Number.isFinite(wind) ? wind : "—"} mph • Updated: ${formatPhillyTime(new Date())}`;
    } else {
      phillyWeatherEl.textContent = "Weather unavailable";
      weatherMetaEl.textContent = "";
    }
  } catch (e) {
    phillyWeatherEl.textContent = "Weather unavailable";
    weatherMetaEl.textContent = "";
  }
}

// ===== Chat Logic =====
async function sendMessage() {
  const message = (inputEl.value || "").trim();
  if (!message) return;

  addUser(message);
  inputEl.value = "";
  setDisabled(true);

  const typingNode = addTyping();

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || "Request failed");

    typingNode.remove();
    addBot(data.text || "(No response)");
  } catch (err) {
    typingNode.remove();
    addBot(`Error: ${err.message}`);
  } finally {
    setDisabled(false);
    inputEl.focus();
  }
}

// ===== Events =====
sendBtn.addEventListener("click", () => sendMessage());

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

clearBtn.addEventListener("click", () => {
  chatEl.innerHTML = "";
  addBot("Chat cleared. Ask a new Philly question whenever you’re ready.");
});

document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    inputEl.value = btn.getAttribute("data-q") || "";
    inputEl.focus();
  });
});

// ===== Boot =====
addBot("Hi! I’m Philly GPT. Ask me about 311-type issues, parking basics, and SEPTA tips.");
tickClock();
updateWeather();

// Update time every second; weather every 10 minutes
setInterval(tickClock, 1000);
setInterval(updateWeather, 10 * 60 * 1000);

export async function onRequestGet() {
  try {
    // Philadelphia
    const lat = 39.9526;
    const lon = -75.1652;

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,wind_speed_10m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph` +
      `&timezone=America%2FNew_York`;

    const r = await fetch(url);
    if (!r.ok) return json({ error: `Weather provider error (${r.status})` }, 502);

    const data = await r.json();
    const cur = data?.current;
    if (!cur) return json({ error: "Weather unavailable" }, 502);

    const tempF = Math.round(cur.temperature_2m);
    const windMph = Math.round(cur.wind_speed_10m);
    const summary = codeToText(cur.weather_code);

    return json({ tempF, windMph, summary }, 200, 300);
  } catch (e) {
    return json({ error: e?.message || "Weather error" }, 500);
  }
}

function codeToText(code) {
  const m = {
    0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Overcast",
    45:"Fog",48:"Rime fog",
    51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",
    61:"Light rain",63:"Rain",65:"Heavy rain",
    71:"Light snow",73:"Snow",75:"Heavy snow",
    80:"Rain showers",81:"Heavy showers",82:"Violent showers",
    95:"Thunderstorm",96:"Thunderstorm + hail",99:"Thunderstorm + heavy hail"
  };
  return m[code] || "Conditions";
}

function json(obj, status = 200, cacheSeconds = 0) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  headers["Cache-Control"] = cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store";
  return new Response(JSON.stringify(obj), { status, headers });
}

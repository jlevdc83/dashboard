const FALLBACK = { lat: 38.9072, lon: -77.0369, label: "Washington, DC" };
const REFRESH_MS = 20 * 60 * 1000;
const RUN_HOT = true;

const $ = (id) => document.getElementById(id);
let lastRefreshTime = null;
let refreshTimer = null;
let minuteTimer = null;

function round(n){ return Math.round(n); }
function fmtShortTime(date){
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);
}
function updateMinutesSince(){
  if (!lastRefreshTime) return;
  const mins = Math.floor((Date.now() - lastRefreshTime) / 60000);
  $("updatedLine").textContent = mins <= 0 ? "Updated just now" : `Updated ${mins} min ago`;
}
function scheduleMinuteTicker(){
  clearInterval(minuteTimer);
  minuteTimer = setInterval(updateMinutesSince, 60000);
}
function sameHourIndex(timeArr, now){
  const nowMs = now.getTime();
  let idx = 0;
  for (let i = 0; i < timeArr.length; i++) {
    const t = new Date(timeArr[i]).getTime();
    if (t <= nowMs) idx = i;
    else break;
  }
  return idx;
}
function maxNextN(arr, start, n){
  let m = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = arr[start + i];
    if (v == null) continue;
    m = Math.max(m, v);
  }
  return m === -Infinity ? 0 : m;
}
function weatherEmoji(code, isDay){
  if (code === 0) return isDay ? "☀️" : "🌙";
  if ([1,2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45,48].includes(code)) return "🌫️";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "☁️";
}
function conditionText(code){
  if (code === 0) return "Clear";
  if ([1,2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if ([45,48].includes(code)) return "Fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 95 && code <= 99) return "Storm";
  return "Cloudy";
}
function clothingPlan(feelsLikeF){
  const t = feelsLikeF + (RUN_HOT ? 4 : 0);
  if (t >= 75) return { text: "Shorts • Short sleeves", icon: "🩳" };
  if (t >= 55) return { text: "Pants • Short sleeves", icon: "👖" };
  return { text: "Pants • Long sleeves", icon: "👖" };
}
function bringPlan(tempF, feelsLikeF, rain4h){
  const items = [];
  if (Math.min(tempF, feelsLikeF) <= 52) items.push({ label: "Jacket", icon: "🧥" });
  if (rain4h >= 35) items.push({ label: "Umbrella", icon: "☔" });
  return items;
}
function protectPlan(uvNow, isDay){
  const items = [];
  if (isDay && uvNow >= 3) items.push({ label: "Sunscreen", icon: "🧴" });
  if (isDay && uvNow >= 2) items.push({ label: "Sunglasses", icon: "🕶️" });
  return items;
}
function nextSunEvent(daily, now){
  const candidates = [];
  for (let i = 0; i < Math.min(2, daily.sunrise.length); i++) {
    const sr = new Date(daily.sunrise[i]);
    const ss = new Date(daily.sunset[i]);
    if (sr > now) candidates.push({ label: "Sunrise", time: sr, icon: "🌅" });
    if (ss > now) candidates.push({ label: "Sunset", time: ss, icon: "🌇" });
  }
  candidates.sort((a,b) => a.time - b.time);
  return candidates[0] || null;
}
function bestWalkWindow(hourly, idx){
  const feels = hourly.apparent_temperature;
  const rain = hourly.precipitation_probability;
  const times = hourly.time;
  const target = RUN_HOT ? 64 : 62;
  let best = null;

  for (let i = 0; i < 6; i++) {
    const a = feels[idx + i];
    const p = rain[idx + i];
    if (a == null || p == null) continue;
    const score = Math.abs((a + (RUN_HOT ? 4 : 0)) - target) + (p * 2);
    if (!best || score < best.score) {
      best = { score, index: idx + i, start: new Date(times[idx + i]) };
    }
  }
  return best;
}
function timeToRain(hourly, idx, now){
  for (let i = 0; i < 6; i++) {
    const p = hourly.precipitation_probability[idx + i];
    if (p != null && p >= 50) {
      const t = new Date(hourly.time[idx + i]);
      const mins = Math.max(0, Math.round((t - now) / 60000));
      if (mins <= 5) return { text: "Rain starting now", urgent: true };
      if (mins < 60) return { text: `Rain in ~${mins}m`, urgent: true };
      return { text: `Rain later • ~${Math.round(mins/60)}h`, urgent: false };
    }
  }
  return { text: "", urgent: false };
}
function walkAssessment(hourly, idx, now, nextSun){
  const feels = hourly.apparent_temperature[idx] + (RUN_HOT ? 4 : 0);
  const best = bestWalkWindow(hourly, idx);
  const rainSoon = timeToRain(hourly, idx, now);

  let status = "Okay";
  let icon = "🐾";
  let cls = "";

  if (rainSoon.urgent) { status = "Plan around rain"; icon = "☔"; cls = "walk-rain-alert"; }
  else if (feels >= 82) { status = "Keep it short"; icon = "🥵"; cls = "walk-warm"; }
  else if (feels >= 72) { status = "Warm but fine"; icon = "😅"; cls = "walk-warm"; }
  else if (feels >= 55) { status = "Perfect now"; icon = "🐾"; cls = "walk-ideal"; }
  else if (feels >= 45) { status = "Brisk"; icon = "🧥"; cls = "walk-cold"; }
  else { status = "Bundle up"; icon = "🥶"; cls = "walk-cold"; }

  let secondary = "Best window now";
  if (best && best.index !== idx) {
    const end = new Date(best.start.getTime() + 90 * 60000);
    secondary = `Best ${fmtShortTime(best.start)}–${fmtShortTime(end)}`;
  }

  if (status === "Perfect now" && nextSun) {
    const minutesToSun = Math.round((nextSun.time - now) / 60000);
    if (minutesToSun > 0 && minutesToSun <= 75) {
      cls = "walk-golden";
      secondary = `Great light soon • ${secondary}`;
    }
  }

  if (rainSoon.text && !rainSoon.urgent) {
    secondary = rainSoon.text;
  }

  return { status, secondary, icon, cls };
}
async function getLocation(){
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: FALLBACK.lat, lon: FALLBACK.lon, label: FALLBACK.label });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Local" }),
      () => resolve({ lat: FALLBACK.lat, lon: FALLBACK.lon, label: FALLBACK.label }),
      { maximumAge: 10 * 60 * 1000, timeout: 6000, enableHighAccuracy: false }
    );
  });
}
async function reverseGeocode(lat, lon){
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json&t=${Date.now()}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    const hit = j?.results?.[0];
    if (!hit) return null;
    return `${hit.name}${hit.admin1 ? ", " + hit.admin1 : ""}`;
  } catch {
    return null;
  }
}
async function fetchForecast(lat, lon){
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&timezone=${encodeURIComponent(tz)}` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,cloudcover,windspeed_10m,uv_index,is_day,weathercode` +
    `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset` +
    `&forecast_days=2&t=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  return r.json();
}
function setStats(items){
  $("stats").innerHTML = items.map(item => `
    <div class="stat">
      <div class="statTop">
        <div class="statIcon">${item.icon}</div>
        <div class="statK">${item.k}</div>
      </div>
      <div class="statV">${item.v}</div>
      <div class="statB">${item.b || ""}</div>
    </div>
  `).join("");
}
async function refresh(){
  try {
    const now = new Date();
    const loc = await getLocation();
    const [forecast, label] = await Promise.all([
      fetchForecast(loc.lat, loc.lon),
      reverseGeocode(loc.lat, loc.lon)
    ]);

    const h = forecast.hourly;
    const d = forecast.daily;
    const idx = sameHourIndex(h.time, now);

    const temp = h.temperature_2m[idx];
    const feels = h.apparent_temperature[idx];
    const rain4h = maxNextN(h.precipitation_probability, idx, 4);
    const uvNow = h.uv_index[idx];
    const uv4h = maxNextN(h.uv_index, idx, 4);
    const cloud = h.cloudcover[idx];
    const wind = h.windspeed_10m[idx];
    const isDay = !!h.is_day[idx];
    const weatherCode = h.weathercode[idx];
    const hi = d.temperature_2m_max?.[0];
    const lo = d.temperature_2m_min?.[0];
    const nextSun = nextSunEvent(d, now);

    const placeText = label || loc.label;

    $("placeLine").textContent = placeText;
    $("tempNow").textContent = `${round(temp)}°`;
    $("feelsNow").textContent = `feels ${round(feels)}°`;
    $("modeIcon").textContent = weatherEmoji(weatherCode, isDay);
    $("conditionLine").textContent = conditionText(weatherCode);

    const nowSub = `${round(wind)} mph wind • ${round(cloud)}% cloud`;
    document.title = `Leave the House • ${round(temp)}°`;

    setStats([
      { icon: "🔆", k: "UV", v: isDay ? `${round(uvNow)}` : "—", b: isDay ? `max ${round(uv4h)}` : "Night" },
      { icon: nextSun?.icon || "🗓️", k: "Next sun", v: nextSun ? `${nextSun.label} ${fmtShortTime(nextSun.time)}` : "—", b: `Hi ${round(hi)}° / Lo ${round(lo)}°` },
      { icon: "💨", k: "Wind", v: `${round(wind)} mph`, b: "Current" },
      { icon: "☁️", k: "Cloud", v: `${round(cloud)}%`, b: "Current" }
    ]);

    // use heroSub nowhere; keep card clean
    // inject location + ambient once in subtitle area using existing node not repeated elsewhere
    const heroSubNode = document.querySelector(".heroSub");
    if (heroSubNode) heroSubNode.textContent = nowSub;

    const wear = clothingPlan(feels);
    $("wearValue").textContent = wear.text;
    $("wearIcon").textContent = wear.icon;

    const bring = bringPlan(temp, feels, rain4h);
    const showBring = bring.length > 0;
    $("bringCard").classList.toggle("hidden", !showBring);
    if (showBring) {
      $("bringValue").textContent = bring.map(x => x.label).join(" + ");
      $("bringIcon").textContent = bring[0].icon;
    }

    const protect = protectPlan(uvNow, isDay);
    const showProtect = protect.length > 0;
    $("protectCard").classList.toggle("hidden", !showProtect);
    if (showProtect) {
      $("protectValue").textContent = protect.map(x => x.label).join(" + ");
      $("protectIcon").textContent = protect[0].icon;
    }

    const walk = walkAssessment(h, idx, now, nextSun);
    const walkCard = $("walkCard");
    walkCard.className = "card mini walkCard";
    if (walk.cls) walkCard.classList.add(walk.cls);
    $("walkValue").textContent = walk.status;
    $("walkSub").textContent = walk.secondary;
    $("walkIcon").textContent = walk.icon;

    lastRefreshTime = Date.now();
    updateMinutesSince();
    scheduleMinuteTicker();
  } catch (e) {
    console.error(e);
    $("updatedLine").textContent = "Offline";
  }
}

refresh();
clearInterval(refreshTimer);
refreshTimer = setInterval(refresh, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

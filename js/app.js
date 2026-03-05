const FALLBACK = { lat: 38.9072, lon: -77.0369 };
const REFRESH_MS = 20 * 60 * 1000;
const RUN_HOT = true;

const $ = (id) => document.getElementById(id);
let lastRefreshTime = null;
let refreshTimer = null;
let minuteTimer = null;
let clockTimer = null;

function round(n){ return Math.round(n); }
function fmtShortTime(date){
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);
}
function updateMinutesSince(){
  if (!lastRefreshTime) return;
  const mins = Math.floor((Date.now() - lastRefreshTime) / 60000);
  $("updatedLine").textContent = mins <= 0 ? "Updated just now" : `Updated ${mins} min ago`;
}
function updateClock(){
  $("timeNow").textContent = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date());
}
function scheduleTickers(){
  clearInterval(minuteTimer);
  clearInterval(clockTimer);
  minuteTimer = setInterval(updateMinutesSince, 60000);
  clockTimer = setInterval(updateClock, 30000);
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
function clothingPlan(tempF, feelsLikeF, windMph, rain4h, uvNow, isDay){
  const t = feelsLikeF + (RUN_HOT ? 4 : 0);

  let base = "";
  let jacket = "";
  let accessories = [];
  let icon = "👖";

  if (t >= 75) {
    base = "Shorts + short sleeves";
    icon = "🩳";
  } else if (t >= 60) {
    base = "Pants + short sleeves";
    icon = "👖";
  } else if (t >= 48) {
    base = "Pants + long sleeves";
    icon = "👖";
  } else {
    base = "Warm layers";
    icon = "🧥";
  }

  if (rain4h >= 40) {
    if (t <= 50) jacket = "Rain jacket over layers";
    else jacket = "Rain jacket";
  } else if (windMph >= 18 && t <= 62) {
    jacket = "Windbreaker";
  } else if (t <= 32) {
    jacket = "Heavy winter coat";
  } else if (t <= 42) {
    jacket = "Heavy jacket";
  } else if (t <= 52) {
    jacket = "Light jacket";
  } else if (t <= 60 && windMph >= 12) {
    jacket = "Light jacket";
  }

  if (t <= 40) accessories.push("hat");
  if (t <= 32) accessories.push("scarf");
  if (t <= 30) accessories.push("gloves");
  if (t <= 40) accessories.push("hat");
  if (t <= 32) accessories.push("scarf");
  if (t <= 30) accessories.push("gloves");

  const main = jacket ? `${base} + ${jacket}` : base;
  let sub = accessories.length ? accessories.join(" • ") : "No extra layers";
  if (windMph >= 20) sub = `windy • ${sub}`;
  return { text: main, icon, sub };
}
function bringPlan(tempF, feelsLikeF, windMph, hourly, idx, now){
  const items = [];
  let umbrella = false;

  const currentRain = hourly.precipitation_probability[idx] ?? 0;
  let rainWithin90 = false;
  let peak90 = currentRain;

  for (let i = 0; i <= 2; i++) {
    const p = hourly.precipitation_probability[idx + i];
    if (p == null) continue;
    peak90 = Math.max(peak90, p);
    if (i <= 1 && p >= 45) rainWithin90 = true;
  }

  if (currentRain >= 35 || rainWithin90 || peak90 >= 60) {
    umbrella = true;
  }

  if (umbrella) items.push({ label: "Umbrella", icon: "☔" });
  else if (windMph >= 22 && feelsLikeF <= 58) items.push({ label: "Windbreaker", icon: "🧥" });

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
function estimatePawRisk(tempF, isDay, cloud, uv){
  const sunBoost = isDay ? Math.max(0, 18 - (cloud * 0.12)) : 0;
  const uvBoost = isDay ? uv * 3 : 0;
  const surface = tempF + sunBoost + uvBoost;
  if (surface >= 95) return { label: "Hot pavement risk", level: "high" };
  if (surface >= 85) return { label: "Warm pavement", level: "medium" };
  return { label: "Paws okay", level: "low" };
}
function dryWindowCountdown(hourly, idx, now){
  for (let i = 0; i < 3; i++) {
    const p = hourly.precipitation_probability[idx + i];
    if (p != null && p >= 50) {
      const t = new Date(hourly.time[idx + i]);
      const mins = Math.max(0, Math.round((t - now) / 60000));
      if (mins <= 5) return "Dry window ending now";
      if (mins < 60) return `Dry for ~${mins}m`;
      return `Dry for ~${Math.round(mins/60)}h`;
    }
  }
  return "Dry for the next 2 hours";
}

function rainTimingSummary(hourly, idx, now){
  const current = hourly.precipitation_probability[idx] ?? 0;
  let first = null;
  let peak = current;
  let peakIndex = idx;

  for (let i = 0; i < 3; i++) {
    const p = hourly.precipitation_probability[idx + i];
    if (p == null) continue;
    if (first === null && p >= 35) first = idx + i;
    if (p > peak) {
      peak = p;
      peakIndex = idx + i;
    }
  }

  let line1 = current >= 35 ? `${Math.round(current)}% chance now` : `${Math.round(peak)}% chance`;
  let line2 = "Low rain risk soon";

  if (first !== null) {
    const t = new Date(hourly.time[first]);
    const mins = Math.max(0, Math.round((t - now) / 60000));
    if (mins <= 5) line2 = "Starting now";
    else if (mins < 60) line2 = `Starting in ${mins}m`;
    else line2 = `Starting in ${Math.round(mins/60)}h`;
  } else if (peak >= 20) {
    const t = new Date(hourly.time[peakIndex]);
    line2 = `Peak near ${fmtShortTime(t)}`;
  }

  return { line1, line2, peak, current };
}
function walkDecision(feelsLikeF, precipProb, pawRisk){
  const t = feelsLikeF + (RUN_HOT ? 4 : 0);
  if (precipProb >= 50) return { label: "Wait now", icon: "☔", cls: "walk-rain-alert", why: "Rain risk" };
  if (pawRisk.level === "high") return { label: "Wait now", icon: "🔥", cls: "walk-paw", why: "Hot pavement" };
  if (t >= 82) return { label: "Wait now", icon: "🥵", cls: "walk-warm", why: "Too hot" };
  if (t >= 72) return { label: "Go soon", icon: "😅", cls: "walk-warm", why: "Warm" };
  if (t >= 55) return { label: "Walk now", icon: "🐾", cls: "walk-ideal", why: "Good conditions" };
  if (t >= 45) return { label: "Okay now", icon: "🧥", cls: "walk-cold", why: "Brisk" };
  return { label: "Wait now", icon: "🥶", cls: "walk-cold", why: "Cold" };
}
function pawWipeNeeded(currentProb, next90Max, humidity){
  return currentProb >= 35 || next90Max >= 45 || humidity >= 88;
}
function walkAssessment(hourly, idx, now, nextSun, tempF, isDay, cloud, uv){
  const next90MaxRain = maxNextN(hourly.precipitation_probability, idx, 2);
  const pawRisk = estimatePawRisk(tempF, isDay, cloud, uv);
  const nowDecision = walkDecision(hourly.apparent_temperature[idx], hourly.precipitation_probability[idx] ?? 0, pawRisk);
  let primary = nowDecision.label;
  let secondary = dryWindowCountdown(hourly, idx, now);
  let tertiary = pawRisk.label;
  let cls = nowDecision.cls;
  let icon = nowDecision.icon;

  if (nextSun && primary === "Walk now") {
    const minutesToSun = Math.round((nextSun.time - now) / 60000);
    if (minutesToSun > 0 && minutesToSun <= 75) {
      cls = "walk-golden";
      tertiary = `Great light soon • ${pawRisk.label}`;
    }
  }

  if (pawWipeNeeded(hourly.precipitation_probability[idx] ?? 0, next90MaxRain, hourly.relative_humidity_2m[idx] ?? 0)) {
    tertiary += " • Wipe paws after";
  }

  return { primary, secondary, tertiary, cls, icon };
}
async function getLocation(){
  return { lat: FALLBACK.lat, lon: FALLBACK.lon };
}
async function fetchForecast(lat, lon){
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&timezone=${encodeURIComponent(tz)}` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,cloudcover,windspeed_10m,uv_index,is_day,weathercode,relative_humidity_2m` +
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
    const forecast = await fetchForecast(loc.lat, loc.lon);

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

    updateClock();
    $("tempNow").textContent = `${round(temp)}°`;
    $("feelsNow").textContent = `feels ${round(feels)}°`;
    $("modeIcon").textContent = weatherEmoji(weatherCode, isDay);
    $("conditionLine").textContent = conditionText(weatherCode);
    $("ambientLine").textContent = `${round(wind)} mph wind • ${round(cloud)}% cloud`;

    setStats([
      { icon: "🔆", k: "UV", v: isDay ? `${round(uvNow)}` : "—", b: isDay ? `max ${round(uv4h)}` : "Night" },
      { icon: nextSun?.icon || "🗓️", k: "Next sun", v: nextSun ? `${nextSun.label} ${fmtShortTime(nextSun.time)}` : "—", b: `Hi ${round(hi)}° / Lo ${round(lo)}°` },
      { icon: weatherEmoji(weatherCode, isDay), k: "Condition", v: conditionText(weatherCode), b: "Current" },
      { icon: "💨", k: "Wind", v: `${round(wind)} mph`, b: "Current" }
    ]);

    const wear = clothingPlan(temp, feels, wind, rain4h, uvNow, isDay);
    $("wearValue").textContent = wear.text;
    $("wearSub").textContent = wear.sub;
    $("wearIcon").textContent = wear.icon;

    const bring = bringPlan(temp, feels, wind, h, idx, now);
    const rainInfo = rainTimingSummary(h, idx, now);
    const showBring = bring.length > 0;
    $("bringCard").classList.toggle("hidden", !showBring);
    if (showBring) {
      const labels = bring.map(x => x.label);
      const hasUmbrella = labels.includes("Umbrella");
      const nonUmbrella = labels.filter(x => x !== "Umbrella");
      $("bringValue").textContent = hasUmbrella
        ? (nonUmbrella.length ? `${nonUmbrella.join(" + ")} + Umbrella` : "Umbrella")
        : labels.join(" + ");
      $("bringSub").textContent = hasUmbrella
        ? `${rainInfo.line1} • ${rainInfo.line2}`
        : "Cool enough for a layer";
      $("bringIcon").textContent = hasUmbrella ? "☔" : bring[0].icon;
    }

    const protect = protectPlan(uvNow, isDay);
    const showProtect = protect.length > 0;
    $("protectCard").classList.toggle("hidden", !showProtect);
    if (showProtect) {
      $("protectValue").textContent = protect.map(x => x.label).join(" + ");
      $("protectSub").textContent = isDay ? `UV ${round(uvNow)}` : "Night";
      $("protectIcon").textContent = protect[0].icon;
    }

    const walk = walkAssessment(h, idx, now, nextSun, temp, isDay, cloud, uvNow);
    const walkCard = $("walkCard");
    walkCard.className = "card action walkCard";
    if (walk.cls) walkCard.classList.add(walk.cls);
    $("walkPrimary").textContent = walk.primary;
    $("walkSecondary").textContent = walk.secondary;
    $("walkTertiary").textContent = walk.tertiary;
    $("walkIcon").textContent = walk.icon;

    lastRefreshTime = Date.now();
    updateMinutesSince();
    scheduleTickers();
  } catch (e) {
    console.error(e);
    $("updatedLine").textContent = "Offline";
  }
}

refresh();
clearInterval(refreshTimer);
refreshTimer = setInterval(refresh, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

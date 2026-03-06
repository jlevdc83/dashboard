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
  if ([1,2].includes(code)) return isDay ? "🌤️" : "🌙";
  if (code === 3) return "☁️";
  if ([45,48].includes(code)) return "🌫️";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 95 && code <= 99) return "⛈️";
  return isDay ? "🌤️" : "🌙";
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
function updateThemeColor(phase, weatherCode){
  const weatherState =
    (weatherCode === 0) ? "clear" :
    ([45,48].includes(weatherCode)) ? "fog" :
    (((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82) || (weatherCode >= 95 && weatherCode <= 99))) ? "rain" :
    "cloud";

  const colors = {
    "phase-dawn": { clear: "#4a4f78", cloud: "#434c70", fog: "#585f80", rain: "#3e4f72" },
    "phase-day": { clear: "#4c6f93", cloud: "#536b84", fog: "#617287", rain: "#48627c" },
    "phase-dusk": { clear: "#5c3f61", cloud: "#564660", fog: "#655a72", rain: "#4c4b67" },
    "phase-night": { clear: "#0c1730", cloud: "#121b2d", fog: "#1a2436", rain: "#10243e" }
  };

  const color = (colors[phase] && colors[phase][weatherState]) || "#0b0d18";
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
}

function applyScene(now, sunriseIso, sunsetIso, weatherCode){
  const body = document.body;
  body.classList.remove("phase-dawn","phase-day","phase-dusk","phase-night","wx-rain","wx-clear","wx-cloud","wx-fog");
  const sunrise = sunriseIso ? new Date(sunriseIso) : null;
  const sunset = sunsetIso ? new Date(sunsetIso) : null;

  let phase = "phase-day";
  if (sunrise && sunset){
    const minsToSunrise = (sunrise - now) / 60000;
    const minsFromSunrise = (now - sunrise) / 60000;
    const minsToSunset = (sunset - now) / 60000;
    if (now < sunrise) phase = minsToSunrise <= 75 ? "phase-dawn" : "phase-night";
    else if (now > sunset) phase = "phase-night";
    else if (minsFromSunrise <= 75) phase = "phase-dawn";
    else if (minsToSunset <= 75) phase = "phase-dusk";
    else phase = "phase-day";
  }
  body.classList.add(phase);

  if (weatherCode === 0) body.classList.add("wx-clear");
  else if ([45,48].includes(weatherCode)) body.classList.add("wx-fog");
  else if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82) || (weatherCode >= 95 && weatherCode <= 99)) body.classList.add("wx-rain");
  else body.classList.add("wx-cloud");

  updateThemeColor(phase, weatherCode);
}
function geocodeZipQuery(zip){
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(zip)}&count=1&countryCode=US&format=json&t=${Date.now()}`;
}
async function geocodeZip(zip){
  const clean = String(zip || "").trim();
  if (!clean) throw new Error("ZIP_REQUIRED");
  const r = await fetch(geocodeZipQuery(clean), { cache: "no-store" });
  const j = await r.json();
  const hit = j?.results?.[0];
  if (!hit) throw new Error("ZIP_NOT_FOUND");
  return { lat: hit.latitude, lon: hit.longitude, zip: clean };
}
async function fallbackToZip(){
  let zip = localStorage.getItem("dashboard_zip") || "";
  if (!zip) {
    zip = window.prompt("Location unavailable. Enter your local ZIP code:");
    if (!zip) throw new Error("LOCATION_REQUIRED");
    localStorage.setItem("dashboard_zip", zip.trim());
  }
  try {
    return await geocodeZip(zip);
  } catch (e) {
    localStorage.removeItem("dashboard_zip");
    const retry = window.prompt("ZIP not recognized. Re-enter your local ZIP code:");
    if (!retry) throw new Error("LOCATION_REQUIRED");
    localStorage.setItem("dashboard_zip", retry.trim());
    return await geocodeZip(retry);
  }
}
function isLikelyLocalFile(){
  return window.location.protocol === "file:";
}
async function getLocation(){
  if (isLikelyLocalFile() || !window.isSecureContext || !navigator.geolocation) {
    return fallbackToZip();
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, zip: localStorage.getItem("dashboard_zip") || "" }),
      () => fallbackToZip().then(resolve).catch(reject),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });
}

async function reverseGeocode(lat, lon){
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json&t=${Date.now()}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    const hit = j?.results?.[0];
    if (!hit) return "";
    return `${hit.name}${hit.admin1 ? ", " + hit.admin1 : ""}`;
  } catch {
    return "";
  }
}

async function fetchNprHeadline(){
  const feed = "https://feeds.npr.org/1001/rss.xml";
  const attempts = [
    `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(feed)}`
  ];

  // Try JSON feed first
  try {
    const r = await fetch(attempts[0], { cache: "no-store" });
    const j = await r.json();
    const item = j?.items?.[0];
    if (item) {
      return {
        title: item.title || "NPR top headline unavailable",
        meta: item.pubDate ? `Top headline • ${new Date(item.pubDate).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Top headline"
      };
    }
  } catch {}

  // Fallback to XML via proxy
  try {
    const r = await fetch(attempts[1], { cache: "no-store" });
    const txt = await r.text();
    const xml = new DOMParser().parseFromString(txt, "text/xml");
    const item = xml.querySelector("channel > item");
    const title = item?.querySelector("title")?.textContent?.trim();
    const pubDate = item?.querySelector("pubDate")?.textContent?.trim();
    if (title) {
      return {
        title,
        meta: pubDate ? `Top headline • ${new Date(pubDate).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Top headline"
      };
    }
  } catch {}

  return { title: "NPR headline unavailable", meta: "Unable to load feed" };
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
function setZipMeta(value){
  const text = String(value || "").trim();
  if (!text) {
    $("zipMeta").textContent = "Location —";
    return;
  }
  $("zipMeta").textContent = /^\d{5}$/.test(text) ? `ZIP ${text}` : text;
}
function setStats(items){
  $("stats").innerHTML = items.map(item => `
    <div class="stat">
      <div class="statLabel">${item.k}</div>
      <div class="statValue">${item.v}</div>
      <div class="statSub">${item.b || ""}</div>
    </div>
  `).join("");
}
function clothingPlan(tempF, feelsLikeF, windMph, rainNear){
  const t = feelsLikeF + (RUN_HOT ? 4 : 0);
  let clothes = "";
  let jacket = "No jacket";
  if (t >= 75) clothes = "shorts + short sleeves";
  else if (t >= 60) clothes = "pants + short sleeves";
  else if (t >= 48) clothes = "pants + long sleeves";
  else clothes = "warm layers";

  if (rainNear >= 40) jacket = t <= 50 ? "Rain jacket over layers" : "Rain jacket";
  else if (windMph >= 18 && t <= 62) jacket = "Windbreaker";
  else if (t <= 32) jacket = "Heavy winter coat";
  else if (t <= 42) jacket = "Heavy jacket";
  else if (t <= 52) jacket = "Light jacket";
  else if (t <= 60 && windMph >= 12) jacket = "Light jacket";

  const extras = [];
  if (t <= 40) extras.push("hat");
  if (t <= 32) extras.push("scarf");
  if (t <= 30) extras.push("gloves");

  return {
    jacket,
    clothes,
    sub: extras.length ? extras.join(" • ") : "No extra cold-weather gear"
  };
}
function sharedDepartureWindow(hourly, idx, now){
  const current = hourly.precipitation_probability[idx] ?? 0;
  let firstRainMins = null;
  let peak90 = current;
  for (let i = 0; i < 3; i++) {
    const p = hourly.precipitation_probability[idx + i];
    if (p == null) continue;
    peak90 = Math.max(peak90, p);
    if (firstRainMins === null && p >= 35) {
      const t = new Date(hourly.time[idx + i]);
      firstRainMins = Math.max(0, Math.round((t - now) / 60000));
    }
  }
  return { currentRain: current, firstRainMins, peak90 };
}
function bringPlan(tempF, feelsLikeF, windMph, horizon){
  const items = [];
  const umbrella = horizon.currentRain >= 35 || (horizon.firstRainMins !== null && horizon.firstRainMins <= 90) || horizon.peak90 >= 60;
  if (umbrella) items.push({ label: "Umbrella", icon: "☔" });
  else if (windMph >= 22 && feelsLikeF <= 58) items.push({ label: "Windbreaker", icon: "🧥" });
  return items;
}
function protectPlan(uvNow, isDay){
  const items = [];
  if (isDay && uvNow >= 3) items.push("Sunscreen");
  if (isDay && uvNow >= 2) items.push("Sunglasses");
  return items;
}
function rainTimingSummary(horizon){
  const current = horizon.currentRain;
  const peak = horizon.peak90;
  let line1 = current >= 35 ? `${Math.round(current)}% chance now` : `${Math.round(peak)}% chance`;
  let line2 = "Low rain risk soon";
  if (horizon.firstRainMins !== null) {
    const mins = horizon.firstRainMins;
    if (mins <= 5) line2 = "Starting now";
    else if (mins < 60) line2 = `Starting in ${mins}m`;
    else line2 = `Starting in ${Math.round(mins/60)}h`;
  }
  return { line1, line2 };
}
function estimatePawRisk(tempF, isDay, cloud, uv){
  const sunBoost = isDay ? Math.max(0, 18 - (cloud * 0.12)) : 0;
  const uvBoost = isDay ? uv * 3 : 0;
  const surface = tempF + sunBoost + uvBoost;
  if (surface >= 95) return { label: "Hot pavement risk", level: "high" };
  if (surface >= 85) return { label: "Warm pavement", level: "medium" };
  return { label: "Paws okay", level: "low" };
}
function dryWindowCountdown(horizon){
  if (horizon.firstRainMins !== null) {
    const mins = horizon.firstRainMins;
    if (mins <= 5) return "Dry window ending now";
    if (mins < 60) return `Dry for ~${mins}m`;
    return `Dry for ~${Math.round(mins/60)}h`;
  }
  return "Dry for the next 2 hours";
}
function walkDecision(feelsLikeF, precipProb, pawRisk){
  const t = feelsLikeF + (RUN_HOT ? 4 : 0);
  if (precipProb >= 50) return { label: "Wait now", cls: "walk-rain-alert", why: "Rain risk" };
  if (pawRisk.level === "high") return { label: "Wait now", cls: "walk-paw", why: "Hot pavement" };
  if (t >= 82) return { label: "Wait now", cls: "walk-warm", why: "Too hot" };
  if (t >= 72) return { label: "Go soon", cls: "walk-warm", why: "Warm" };
  if (t >= 55) return { label: "Walk now", cls: "walk-ideal", why: "Good conditions" };
  if (t >= 45) return { label: "Okay now", cls: "walk-cold", why: "Brisk" };
  return { label: "Wait now", cls: "walk-cold", why: "Cold" };
}
function nextSunEvent(daily, now){
  const candidates = [];
  for (let i = 0; i < Math.min(2, daily.sunrise.length); i++) {
    const sr = new Date(daily.sunrise[i]);
    const ss = new Date(daily.sunset[i]);
    if (sr > now) candidates.push({ label: "Sunrise", time: sr });
    if (ss > now) candidates.push({ label: "Sunset", time: ss });
  }
  candidates.sort((a,b) => a.time - b.time);
  return candidates[0] || null;
}
function pawWipeNeeded(currentProb, next90Max, humidity){
  return currentProb >= 35 || next90Max >= 45 || humidity >= 88;
}
function walkEmojiForDecision(primary, tertiary){
  if (/Wait now/i.test(primary) && /Hot pavement/i.test(tertiary)) return "🔥";
  if (/Wait now/i.test(primary)) return "⏳";
  if (/Go soon/i.test(primary)) return "🚶";
  if (/Walk now/i.test(primary)) return "🐾";
  if (/Okay now/i.test(primary)) return "🐕";
  return "🐾";
}

function walkAssessment(hourly, idx, now, nextSun, tempF, isDay, cloud, uv, horizon){
  const next90MaxRain = horizon.peak90;
  const pawRisk = estimatePawRisk(tempF, isDay, cloud, uv);
  const decision = walkDecision(hourly.apparent_temperature[idx], hourly.precipitation_probability[idx] ?? 0, pawRisk);
  let secondary = dryWindowCountdown(horizon);
  let tertiary = pawRisk.label;
  let cls = decision.cls;

  if (nextSun && decision.label === "Walk now") {
    const minutesToSun = Math.round((nextSun.time - now) / 60000);
    if (minutesToSun > 0 && minutesToSun <= 75) {
      cls = "walk-golden";
      tertiary = `Great light soon • ${pawRisk.label}`;
    }
  }
  if (pawWipeNeeded(hourly.precipitation_probability[idx] ?? 0, next90MaxRain, hourly.relative_humidity_2m[idx] ?? 0)) {
    tertiary += " • Wipe paws after";
  }
  return { primary: decision.label, secondary, tertiary, cls };
}


function setHeadlineCard(headline){
  const titleEl = $("headlineTitle");
  const metaEl = $("headlineMeta");
  if (titleEl) titleEl.textContent = headline?.title || "NPR headline unavailable";
  if (metaEl) metaEl.textContent = headline?.meta || "Top headline";
}

async function refresh(){
  try {
    const now = new Date();
    const loc = await getLocation();
    const cityName = !loc.zip ? await reverseGeocode(loc.lat, loc.lon) : "";
    setZipMeta(loc.zip || cityName || localStorage.getItem("dashboard_zip") || "");
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
    const horizon = sharedDepartureWindow(h, idx, now);
    const rainNear = horizon.peak90;

    applyScene(now, d.sunrise?.[0], d.sunset?.[0], weatherCode);
    updateClock();

    $("tempNow").textContent = `${round(temp)}°`;
    $("feelsNow").textContent = `feels ${round(feels)}°`;
    $("modeBadge").textContent = weatherEmoji(weatherCode, isDay);
    $("conditionLine").textContent = conditionText(weatherCode);
    $("ambientLine").textContent = `${round(wind)} mph wind • ${round(cloud)}% cloud`;

    setStats([
      { k: "UV", v: isDay ? `${round(uvNow)}` : "—", b: isDay ? `max ${round(uv4h)}` : "Night" },
      { k: "Next sun", v: nextSun ? `${nextSun.label} ${fmtShortTime(nextSun.time)}` : "—", b: `Hi ${round(hi)}° / Lo ${round(lo)}°` },
      { k: "Rain", v: `${round(rain4h)}%`, b: "next 4h" },
      { k: "Feels", v: `${round(feels)}°`, b: "current" }
    ]);

    const wear = clothingPlan(temp, feels, wind, rainNear);
    $("jacketValue").textContent = wear.jacket;
    $("wearValue").textContent = wear.clothes;
    $("wearSub").textContent = wear.sub || "";

    const bring = bringPlan(temp, feels, wind, horizon);
    const showBring = bring.length > 0;
    $("bringCard").classList.toggle("hidden", !showBring);
    if (showBring) {
      const labels = bring.map(x => x.label);
      $("bringValue").textContent = labels.join(" + ");
      if (labels.includes("Umbrella")) {
        const rainInfo = rainTimingSummary(horizon);
        $("bringSub").textContent = `${rainInfo.line1} • ${rainInfo.line2}`;
      } else {
        $("bringSub").textContent = wind >= 22 ? `Wind ${round(wind)} mph` : "Extra shell";
      }
    }

    const protect = protectPlan(uvNow, isDay);
    const showProtect = protect.length > 0;
    $("protectCard").classList.toggle("hidden", !showProtect);
    if (showProtect) {
      $("protectValue").textContent = protect.join(" + ");
      $("protectSub").textContent = isDay ? `UV ${round(uvNow)} now` : "Night";
    }

    const walk = walkAssessment(h, idx, now, nextSun, temp, isDay, cloud, uvNow, horizon);
    const walkCard = $("walkCard");
    walkCard.className = "card action walkCard";
    if (walk.cls) walkCard.classList.add(walk.cls);
    const walkEmoji = walkEmojiForDecision(walk.primary, walk.tertiary);
    $("walkPrimary").textContent = `${walkEmoji} ${walk.primary}`;
    $("walkSecondary").textContent = walk.secondary;
    $("walkTertiary").textContent = walk.tertiary;

    lastRefreshTime = Date.now();
    updateMinutesSince();
    scheduleTickers();
  } catch (e) {
    console.error(e);
    $("updatedLine").textContent = "Location needed";
    $("conditionLine").textContent = "Enable location or enter ZIP";
    $("ambientLine").textContent = "Weather can’t load without a location";
    setZipMeta(localStorage.getItem("dashboard_zip") || "");

  }
}

refresh();
clearInterval(refreshTimer);
refreshTimer = setInterval(refresh, REFRESH_MS);

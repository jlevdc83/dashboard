
const REFRESH_MS = 20 * 60 * 1000;
let lastRefresh = null;

function updateMinutes(){
  if(!lastRefresh) return;
  const mins = Math.floor((Date.now()-lastRefresh)/60000);
  document.getElementById("updatedLine").textContent =
    mins===0 ? "Updated just now" : `Updated ${mins} min ago`;
}

setInterval(updateMinutes,60000);

async function refresh(){
  try{
    const lat=38.9072, lon=-77.0369;
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=${tz}&temperature_unit=fahrenheit&windspeed_unit=mph&hourly=temperature_2m,apparent_temperature,precipitation_probability,is_day&t=${Date.now()}`;
    const r=await fetch(url,{cache:"no-store"});
    const j=await r.json();

    const h=j.hourly;
    const now=new Date();
    const idx=h.time.findIndex(t=>new Date(t)>now)-1;

    const temp=h.temperature_2m[idx];
    const feels=h.apparent_temperature[idx];
    const rain=h.precipitation_probability[idx];

    document.getElementById("tempNow").textContent=`${Math.round(temp)}°`;
    document.getElementById("feelsNow").textContent=`feels ${Math.round(feels)}°`;
    document.getElementById("heroLine").textContent=
      feels>=65?"Short sleeves":"Long sleeves";

    const walkCard=document.getElementById("walkCard");
    walkCard.className="card mini walk walkCard";

    if(rain>=50) walkCard.classList.add("walk-rain-alert");
    else if(feels>=65) walkCard.classList.add("walk-ideal");
    else walkCard.classList.add("walk-cold");

    document.getElementById("walkPrimary").textContent=
      rain>=50?"Rain risk":"Good now";

    lastRefresh=Date.now();
    updateMinutes();

  }catch(e){
    document.getElementById("updatedLine").textContent="Offline";
  }
}

refresh();
setInterval(refresh,REFRESH_MS);

/* =========================================================
   RescueBot — Disaster Rescue Route Finder (REAL MAP version)
   Intelligent Robotics Project (Website only, no IoT)

   Real map  : Leaflet + OpenStreetMap  (real roads/places of
               Tamil Nadu, India — works like Google Maps,
               free, no API key needed)
   Real route: OSRM public routing service (real road paths)

   1. PERCEIVE - User clicks the real map to create a disaster
   2. DECIDE   - RescueBot finds the nearest safe zone whose
                 REAL road route avoids the disaster area.
                 If the direct road passes through the disaster,
                 it tries a detour point around the disaster.
   3. ACT      - Route is drawn on the real map + a transport
                 (Walk / Bike / Car) is recommended by rules.
   ========================================================= */

// ---------- 1. Create the real map, centred on Tamil Nadu ----------
const map = L.map("map").setView([10.85, 78.65], 7); // Tamil Nadu centre
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

// ---------- 2. Data ----------
const TAMIL_NADU_SAFE_ZONES = [
  { name: "Coimbatore Relief Centre (Nehru Stadium)", lat: 11.0060, lng: 76.9700 },
  { name: "Chennai Relief Centre (Marina / MCC Ground)", lat: 13.0580, lng: 80.2780 },
  { name: "Madurai Relief Centre", lat: 9.9252, lng: 78.1198 },
  { name: "Trichy Relief Centre", lat: 10.7905, lng: 78.7047 },
  { name: "Salem Relief Centre", lat: 11.6643, lng: 78.1460 },
  { name: "Thanjavur Relief Centre", lat: 10.7870, lng: 79.1378 },
  { name: "Tirunelveli Relief Centre", lat: 8.7139, lng: 77.7567 },
  { name: "Vellore Relief Centre", lat: 12.9165, lng: 79.1325 },
  { name: "Erode Relief Centre", lat: 11.3410, lng: 77.7172 },
  { name: "Kanyakumari Relief Centre", lat: 8.0883, lng: 77.5385 },
];

let safeZones = [...TAMIL_NADU_SAFE_ZONES];
let disasters = [];              // { lat, lng, radiusKm, type, layers: [] }
let currentMode = "disaster";
let routeLine = null;

// My location — default: Karunya University, Coimbatore
let personLatLng = L.latLng(10.9367, 76.7447);

const emojiIcon = (emoji, size = 26) =>
  L.divIcon({ className: "emoji-marker", html: `<div style="font-size:${size}px">${emoji}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

// Person / RescueBot marker (draggable)
const personMarker = L.marker(personLatLng, { icon: emojiIcon("🤖", 30), draggable: true })
  .addTo(map).bindPopup("<b>You / RescueBot</b><br>Drag me, or use 'My Location' mode and click the map.");
personMarker.on("dragend", () => { personLatLng = personMarker.getLatLng(); hideResults(); });

// Safe zone markers
let safeZoneMarkers = [];
function drawSafeZones() {
  safeZoneMarkers.forEach(m => map.removeLayer(m));
  safeZoneMarkers = safeZones.map(z =>
    L.marker([z.lat, z.lng], { icon: emojiIcon("🟢", 20) }).addTo(map).bindPopup(`<b>Safe Zone</b><br>${z.name}`)
  );
}
drawSafeZones();

// ---------- 3. Helper maths ----------
function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function disasterIcon() {
  return { flood: "🌊", fire: "🔥", earthquake: "🏚️", landslide: "⛰️", cyclone: "🌀" }[document.getElementById("disasterType").value] || "⚠️";
}

// ---------- 4. Clicking the real map = creating the scenario ----------
map.on("click", (e) => {
  hideResults();
  if (currentMode === "person") {
    personLatLng = e.latlng;
    personMarker.setLatLng(e.latlng);
  } else if (currentMode === "safezone") {
    const z = { name: "Custom Safe Zone " + (safeZones.length - 9), lat: e.latlng.lat, lng: e.latlng.lng };
    safeZones.push(z); drawSafeZones();
  } else {
    createDisaster(e.latlng.lat, e.latlng.lng);
  }
});

function createDisaster(lat, lng) {
  const type = document.getElementById("disasterType").value;
  const radiusKm = parseInt(document.getElementById("disasterSize").value, 10);
  const layers = [
    // danger area (bigger, orange, light)
    L.circle([lat, lng], { radius: radiusKm * 1500, color: "#f59e0b", weight: 1, fillColor: "#f59e0b", fillOpacity: 0.15 }).addTo(map),
    // disaster zone (red)
    L.circle([lat, lng], { radius: radiusKm * 1000, color: "#dc2626", weight: 2, fillColor: "#dc2626", fillOpacity: 0.45 }).addTo(map)
      .bindPopup(`<b>${type.toUpperCase()}</b><br>Disaster zone: ${radiusKm} km radius`),
    L.marker([lat, lng], { icon: emojiIcon(disasterIcon(), 28) }).addTo(map),
  ];
  disasters.push({ lat, lng, radiusKm, type, layers });
}
function clearDisasters() {
  disasters.forEach(d => d.layers.forEach(l => map.removeLayer(l)));
  disasters = []; hideResults();
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
}

// ---------- 5. Real road routing with OSRM ----------
// Returns { distanceKm, coords: [[lat,lng],...] } or null
async function osrmRoute(points) {
  const coords = points.map(p => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes.length) return null;
    const r = data.routes[0];
    return { distanceKm: r.distance / 1000, coords: r.geometry.coordinates.map(c => [c[1], c[0]]) };
  } catch { return null; } // no internet / service down
}

// Does this road route pass through any disaster zone?
function routeHitsDisaster(coords) {
  if (!disasters.length) return false;
  return coords.some(([lat, lng]) =>
    disasters.some(d => haversineKm({ lat, lng }, d) < d.radiusKm * 1.05)
  );
}

// A point pushed away from the disaster, used as a detour waypoint
function detourPoint(from, to, disaster) {
  const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
  let vx = mid.lng - disaster.lng, vy = mid.lat - disaster.lat;
  const len = Math.hypot(vx, vy) || 1; vx /= len; vy /= len;
  const pushKm = disaster.radiusKm + 4;
  // 1 degree lat ≈ 111 km, 1 degree lng ≈ 111*cos(lat) km
  return { lat: disaster.lat + vy * (pushKm / 111), lng: disaster.lng + vx * (pushKm / (111 * Math.cos(disaster.lat * Math.PI / 180))) };
}

/* Find the best safe zone:
   - try nearest safe zones first
   - prefer a direct road route that avoids the disaster
   - else try a detour route around the disaster
   - else (only if forced) use the shortest direct route + warning */
async function findBestRoute() {
  const start = { lat: personLatLng.lat, lng: personLatLng.lng };
  const candidates = [...safeZones]
    .map(z => ({ zone: z, straightKm: haversineKm(start, z) }))
    .sort((a, b) => a.straightKm - b.straightKm)
    .slice(0, 5);

  let fallback = null;
  for (const { zone } of candidates) {
    const direct = await osrmRoute([start, zone]);
    if (!direct) continue;
    if (!routeHitsDisaster(direct.coords)) return { zone, route: direct, note: "Direct road route — it does not pass through the disaster area." };
    if (!fallback) fallback = { zone, route: direct, note: "⚠️ Warning: every road route passes near the disaster area. This is the shortest one — travel with caution." };

    // try going around the disaster that blocks this route
    const blocker = disasters.find(d => direct.coords.some(([lat, lng]) => haversineKm({ lat, lng }, d) < d.radiusKm * 1.05));
    if (blocker) {
      const via = detourPoint(start, zone, blocker);
      const detour = await osrmRoute([start, via, zone]);
      if (detour && !routeHitsDisaster(detour.coords)) {
        return { zone, route: detour, note: "The direct road passed through the disaster, so RescueBot diverted the route around the disaster area." };
      }
    }
  }
  return fallback;
}

/* =========================================================
   TRANSPORT RECOMMENDATION (rule-based, same logic as v1,
   now using the REAL road distance)
   ========================================================= */
function recommendTransport(distanceKm) {
  const type = document.getElementById("disasterType").value;
  const people = parseInt(document.getElementById("peopleCount").value, 10);
  const vehicle = document.getElementById("vehicle").value;
  const times = {
    walk: Math.round((distanceKm / 5) * 60),
    bike: Math.round((distanceKm / 15) * 60),
    car: Math.round((distanceKm / 30) * 60),
  };
  let choice, reason;
  if (distanceKm <= 0.8) {
    choice = "walk"; reason = "The safe zone is very close. Walking is fastest — no time wasted starting a vehicle, and roads near a disaster may be jammed.";
  } else if (people >= 6) {
    choice = (vehicle === "car" || vehicle === "both") ? "car" : "walk";
    reason = choice === "car" ? "You are a large group. A car keeps everyone together and can make repeat trips." : "You are a large group but no car is available. Walk together in a group and stay on the marked route.";
  } else if (type === "flood" || type === "cyclone") {
    choice = (vehicle === "car" || vehicle === "both") ? "car" : "walk";
    reason = "Flood / cyclone water is dangerous and can stall a bike. A car has higher ground clearance. If no car, walk only through shallow areas — do not use a bike in deep water.";
  } else if (type === "earthquake" || type === "landslide") {
    choice = vehicle === "none" ? "walk" : "bike";
    reason = "Debris blocks wide roads after an earthquake / landslide. A bike can pass through narrow gaps where a car cannot, so it escapes faster.";
  } else if (type === "fire") {
    choice = (vehicle === "car" || vehicle === "both") && distanceKm > 2 ? "car" : (vehicle === "none" ? "walk" : "bike");
    reason = "Fire spreads fast, so speed matters most. " + (choice === "car" ? "A car also protects you from smoke and heat." : "A bike is quick and can escape before roads are blocked.");
  } else if (distanceKm > 25 && (vehicle === "car" || vehicle === "both")) {
    choice = "car"; reason = "The safe zone is far. A car is the fastest and safest option for this distance.";
  } else if (vehicle !== "none") {
    choice = "bike"; reason = "Medium distance. A bike is faster than walking and can move through traffic near the disaster area.";
  } else {
    choice = "walk"; reason = "No vehicle is available, so walking on the marked safe route is the best option.";
  }
  const meta = {
    walk: { icon: "🚶", name: "Walk" },
    bike: { icon: "🏍️", name: "Bike / Scooter" },
    car: { icon: "🚗", name: "Car" },
  };
  return { ...meta[choice], reason, times };
}

// ---------- 6. UI wiring ----------
function hideResults() {
  document.getElementById("result").classList.add("hidden");
  document.getElementById("noRoute").classList.add("hidden");
}
function setStatus(msg) { document.getElementById("status").textContent = msg; }

document.getElementById("findRouteBtn").addEventListener("click", async () => {
  hideResults();
  const btn = document.getElementById("findRouteBtn");
  btn.disabled = true; setStatus("🤖 RescueBot is checking real road routes to the nearest safe zones...");
  try {
    const found = await findBestRoute();
    if (!found) { document.getElementById("noRoute").classList.remove("hidden"); setStatus(""); return; }

    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(found.route.coords, { color: "#2563eb", weight: 6, opacity: 0.85 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

    const t = recommendTransport(found.route.distanceKm);
    document.getElementById("resultSafeZone").innerHTML = `<b>Nearest safe zone:</b> ${found.zone.name}`;
    document.getElementById("resultDistance").innerHTML = `<b>Route distance (by road):</b> ${found.route.distanceKm.toFixed(1)} km`;
    document.getElementById("resultNote").textContent = found.note;
    document.getElementById("transportIcon").textContent = t.icon;
    document.getElementById("transportName").textContent = t.name;
    document.getElementById("transportReason").textContent = t.reason;
    document.getElementById("transportTimes").textContent = `⏱ Walk: ${t.times.walk} min • Bike: ${t.times.bike} min • Car: ${t.times.car} min`;
    document.getElementById("result").classList.remove("hidden");
    setStatus("");
  } finally { btn.disabled = false; }
});

document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); currentMode = btn.dataset.mode;
  });
});
document.getElementById("clearBtn").addEventListener("click", clearDisasters);

// Preset scenarios on the real map
const presets = {
  "chennai-flood": () => { document.getElementById("disasterType").value = "flood"; document.getElementById("disasterSize").value = "10"; personLatLng = L.latLng(13.0, 80.22); personMarker.setLatLng(personLatLng); createDisaster(13.07, 80.29); map.setView([13.05, 80.25], 11); },
  "nilgiris-landslide": () => { document.getElementById("disasterType").value = "landslide"; document.getElementById("disasterSize").value = "5"; personLatLng = L.latLng(11.35, 76.70); personMarker.setLatLng(personLatLng); createDisaster(11.41, 76.695); map.setView([11.38, 76.72], 11); },
  "madurai-fire": () => { document.getElementById("disasterType").value = "fire"; document.getElementById("disasterSize").value = "5"; personLatLng = L.latLng(9.96, 78.10); personMarker.setLatLng(personLatLng); createDisaster(9.93, 78.13); map.setView([9.94, 78.12], 12); },
};
document.querySelectorAll(".preset-btn[data-preset]").forEach(btn => {
  btn.addEventListener("click", () => { clearDisasters(); presets[btn.dataset.preset](); });
});

// Search a place in Tamil Nadu (Nominatim - free OpenStreetMap search)
async function searchPlace() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return;
  setStatus("🔍 Searching for " + q + "...");
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q + ", Tamil Nadu, India")}`);
    const data = await res.json();
    if (data.length) { map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 12); setStatus("📍 Found: " + data[0].display_name.split(",").slice(0, 3).join(",")); }
    else setStatus("Place not found. Try another name.");
  } catch { setStatus("Search failed — check internet connection."); }
}
document.getElementById("searchBtn").addEventListener("click", searchPlace);
document.getElementById("searchInput").addEventListener("keydown", e => { if (e.key === "Enter") searchPlace(); });

/* =========================================================
   RescueBot — Disaster Evacuation System (v8)
   Intelligent Robotics Project (Website only, no IoT)

   PURPOSE: This app is for the PEOPLE LIVING IN a disaster
   area. When a disaster is registered by clicking the real
   map of Tamil Nadu, the people of THAT area are immediately
   routed to their nearest safe zone.

   1. PERCEIVE - Click the map -> a disaster appears there,
                 with a high-intensity core, a low-intensity
                 outer area and an internal shelter.
   2. DECIDE   - For that disaster's people, RescueBot finds
                 their nearest safe zone and a real-road route
                 (OSRM) that exits their disaster and avoids
                 every other disaster's core. If the road
                 service is unreachable, an estimated route is
                 used - a route is ALWAYS produced.
   3. ACT      - The route is drawn in that disaster's own
                 colour, a moving "people" marker travels along
                 it to the safe zone, and transport (walk /
                 bike / car) is recommended for those people.
   Every disaster gets its OWN route, automatically, on click.
   ========================================================= */

// ---------- 1. Real map of Tamil Nadu with automatic tile fallback ----------
const map = L.map("map").setView([10.85, 78.65], 7);
const baseLayers = [
  { name: "Street — Esri", layer: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri — Source: Esri, OpenStreetMap contributors" }) },
  { name: "Street — OSM Germany", layer: L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors (DE server)" }) },
  { name: "Street — OSM France", layer: L.tileLayer("https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors, HOT (FR server)" }) },
  { name: "Satellite — Esri", layer: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri — World Imagery" }) },
];
let activeBase = 0, tileErrorCount = 0, tileErrorTimer = null;
function activateBase(index, auto = false) {
  baseLayers.forEach((b, i) => { if (i !== index && map.hasLayer(b.layer)) map.removeLayer(b.layer); });
  activeBase = index; tileErrorCount = 0;
  if (!map.hasLayer(baseLayers[index].layer)) baseLayers[index].layer.addTo(map);
  const srcEl = document.getElementById("mapSource");
  if (srcEl) srcEl.textContent = "Map source: " + baseLayers[index].name;
  if (auto) setStatus("Map provider was blocked, switched automatically to: " + baseLayers[index].name);
}
baseLayers.forEach((b, i) => {
  b.layer.on("tileerror", () => {
    if (i !== activeBase) return;
    tileErrorCount++;
    clearTimeout(tileErrorTimer); tileErrorTimer = setTimeout(() => { tileErrorCount = 0; }, 4000);
    if (tileErrorCount >= 6) activateBase((activeBase + 1) % baseLayers.length, true);
  });
  b.layer.on("tileload", () => { if (i === activeBase) tileErrorCount = 0; });
});
const layersControl = {}; baseLayers.forEach(b => { layersControl[b.name] = b.layer; });
L.control.layers(layersControl).addTo(map);
map.on("baselayerchange", (e) => {
  const idx = baseLayers.findIndex(b => b.layer === e.layer);
  if (idx >= 0) { activeBase = idx; tileErrorCount = 0; const s = document.getElementById("mapSource"); if (s) s.textContent = "Map source: " + baseLayers[idx].name; }
});

// ---------- 2. Safe zones across Tamil Nadu (28) ----------
const TAMIL_NADU_SAFE_ZONES = [
  { name: "Chennai Relief Centre", lat: 13.0580, lng: 80.2780 }, { name: "Kanchipuram Relief Centre", lat: 12.8342, lng: 79.7036 },
  { name: "Tiruvannamalai Relief Centre", lat: 12.2253, lng: 79.0747 }, { name: "Vellore Relief Centre", lat: 12.9165, lng: 79.1325 },
  { name: "Villupuram Relief Centre", lat: 11.9401, lng: 79.4861 }, { name: "Cuddalore Relief Centre", lat: 11.7560, lng: 79.7560 },
  { name: "Salem Relief Centre", lat: 11.6643, lng: 78.1460 }, { name: "Dharmapuri Relief Centre", lat: 12.1211, lng: 78.1582 },
  { name: "Erode Relief Centre", lat: 11.3410, lng: 77.7172 }, { name: "Tiruppur Relief Centre", lat: 11.1085, lng: 77.3411 },
  { name: "Coimbatore Relief Centre", lat: 11.0060, lng: 76.9700 }, { name: "Pollachi Relief Centre", lat: 10.6629, lng: 77.0065 },
  { name: "Ooty (Udhagamandalam) Relief Centre", lat: 11.4102, lng: 76.6950 }, { name: "Namakkal Relief Centre", lat: 11.2189, lng: 78.1674 },
  { name: "Karur Relief Centre", lat: 10.9601, lng: 78.0766 }, { name: "Dindigul Relief Centre", lat: 10.3673, lng: 77.9803 },
  { name: "Trichy Relief Centre", lat: 10.7905, lng: 78.7047 }, { name: "Thanjavur Relief Centre", lat: 10.7870, lng: 79.1378 },
  { name: "Kumbakonam Relief Centre", lat: 10.9601, lng: 79.3845 }, { name: "Pudukkottai Relief Centre", lat: 10.3833, lng: 78.8001 },
  { name: "Nagapattinam Relief Centre", lat: 10.7672, lng: 79.8449 }, { name: "Madurai Relief Centre", lat: 9.9252, lng: 78.1198 },
  { name: "Virudhunagar Relief Centre", lat: 9.5680, lng: 77.9624 }, { name: "Sivaganga Relief Centre", lat: 9.8433, lng: 78.4809 },
  { name: "Ramanathapuram Relief Centre", lat: 9.3639, lng: 78.8395 }, { name: "Tirunelveli Relief Centre", lat: 8.7139, lng: 77.7567 },
  { name: "Thoothukudi Relief Centre", lat: 8.7642, lng: 78.1348 }, { name: "Kanyakumari Relief Centre", lat: 8.0883, lng: 77.5385 },
];
let safeZones = [...TAMIL_NADU_SAFE_ZONES];
let disasters = [];       // { lat, lng, radiusKm, type, shelter, layers }
let currentMode = "disaster";
let routeLines = [];      // all drawn route layers (for clearing)
let evacTimers = [];      // moving-people animation timers
const DISASTER_ROUTE_COLORS = ["#9333ea", "#db2777", "#ea580c", "#0891b2", "#65a30d", "#4f46e5", "#b45309", "#be185d"];

// ---------- 3. Professional radar markers (no emojis) ----------
function radarIcon(kind, faClass, extraClass = "", color = "") {
  return L.divIcon({
    className: "custom-marker",
    html: `<div class="mkr ${kind} ${extraClass}" ${color ? `style="color:${color}"` : ""}><span class="radar-ring"></span><span class="radar-ring r2"></span><span class="mkr-core" ${color ? `style="background:${color}"` : ""}><i class="fa-solid ${faClass}"></i></span></div>`,
    iconSize: [40, 40], iconAnchor: [20, 20],
  });
}
const safeIcon = () => radarIcon("mkr-safe", "fa-shield-halved");
const shelterIcon = () => radarIcon("mkr-shelter", "fa-house-medical");
const peopleIcon = (color) => radarIcon("mkr-people", "fa-people-group", "", color);
function disasterFaClass(type) {
  return { flood: "fa-water", fire: "fa-fire", earthquake: "fa-house-crack", landslide: "fa-hill-rockslide", cyclone: "fa-hurricane" }[type] || "fa-triangle-exclamation";
}
let safeZoneMarkers = [];
function drawSafeZones() {
  safeZoneMarkers.forEach(m => map.removeLayer(m));
  safeZoneMarkers = safeZones.map(z => L.marker([z.lat, z.lng], { icon: safeIcon() }).addTo(map).bindPopup(`<b>Safe Zone</b><br>${z.name}`));
}
drawSafeZones();

// ---------- 4. Maths helpers ----------
function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function setStatus(msg) { document.getElementById("status").textContent = msg; }
function nearestSafeZone(point) {
  return [...safeZones].sort((a, b) => haversineKm(point, a) - haversineKm(point, b))[0];
}

// ---------- 5. Registering a disaster (click) ----------
map.on("click", (e) => {
  if (currentMode === "safezone") {
    safeZones.push({ name: "Custom Safe Zone " + (safeZones.length - 27), lat: e.latlng.lat, lng: e.latlng.lng });
    drawSafeZones(); setStatus("Safe zone added. Click the map in Register Disaster mode to evacuate an area.");
  } else {
    createDisaster(e.latlng.lat, e.latlng.lng); // this also routes its people automatically
  }
});

function createDisaster(lat, lng) {
  const type = document.getElementById("disasterType").value;
  const radiusKm = parseInt(document.getElementById("disasterSize").value, 10);

  // Internal shelter: inside the low-intensity outer area (at 80% of the
  // radius), on the side facing this area's nearest safe zone.
  const nearest = nearestSafeZone({ lat, lng });
  let vx = nearest.lng - lng, vy = nearest.lat - lat;
  const vlen = Math.hypot(vx, vy) || 1; vx /= vlen; vy /= vlen;
  const shelterKm = radiusKm * 0.8;
  const shelter = {
    name: "Internal Safe Shelter (" + type + " - low intensity area)",
    lat: lat + vy * (shelterKm / 111),
    lng: lng + vx * (shelterKm / (111 * Math.cos(lat * Math.PI / 180))),
  };

  const layers = [
    L.circle([lat, lng], { radius: radiusKm * 1500, color: "#f59e0b", weight: 1, fillColor: "#f59e0b", fillOpacity: 0.10 }).addTo(map),
    L.circle([lat, lng], { radius: radiusKm * 1000, color: "#ea580c", weight: 1, fillColor: "#fb923c", fillOpacity: 0.28 }).addTo(map)
      .bindPopup(`<b>${type.toUpperCase()} - LOW INTENSITY AREA</b><br>Outer part of the disaster. The internal safe shelter for the people here is in this area.`),
    L.circle([lat, lng], { radius: radiusKm * 600, color: "#991b1b", weight: 2, fillColor: "#dc2626", fillOpacity: 0.55 }).addTo(map)
      .bindPopup(`<b>${type.toUpperCase()} - HIGH INTENSITY CORE</b><br>Most dangerous part. Evacuation routes exit this core and avoid all other cores.`),
    L.marker([lat, lng], { icon: radarIcon("mkr-disaster", disasterFaClass(type), type) }).addTo(map),
    L.marker([shelter.lat, shelter.lng], { icon: shelterIcon() }).addTo(map)
      .bindPopup(`<b>Internal Safe Shelter</b><br>Safe place inside this disaster's low-intensity area, for its people.`),
  ];
  const disaster = { lat, lng, radiusKm, type, shelter, layers };
  disasters.push(disaster);

  // THE KEY BEHAVIOUR: the people of this area are evacuated immediately
  routeDisaster(disaster);
  return disaster;
}

function clearAll() {
  disasters.forEach(d => d.layers.forEach(l => map.removeLayer(l)));
  disasters = []; clearRouteLines();
  document.getElementById("disasterRouteList").innerHTML = "";
  document.getElementById("disasterRoutes").classList.add("hidden");
  setStatus("All disasters cleared. Click on the map to register a disaster — the people there will be routed to safety automatically.");
}
function clearRouteLines() {
  evacTimers.forEach(clearInterval); evacTimers = [];
  routeLines.forEach(l => map.removeLayer(l)); routeLines = [];
}

// ---------- 6. Routing (real roads via OSRM, with guaranteed fallback) ----------
async function osrmRoute(points) {
  const coords = points.map(p => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes.length) return null;
    const r = data.routes[0];
    return { distanceKm: r.distance / 1000, coords: r.geometry.coordinates.map(c => [c[1], c[0]]) };
  } catch { return null; }
}
function straightLineCoords(a, b, steps = 40) {
  const coords = [];
  for (let i = 0; i <= steps; i++) coords.push([a.lat + (b.lat - a.lat) * i / steps, a.lng + (b.lng - a.lng) * i / steps]);
  return coords;
}
function fallbackRoute(start, dest) { return { distanceKm: haversineKm(start, dest) * 1.3, coords: straightLineCoords(start, dest), estimated: true }; }
function routeHitsCoreExcept(coords, excludeIndex) {
  if (!disasters.length) return false;
  return coords.some(([lat, lng]) => disasters.some((d, i) => i !== excludeIndex && haversineKm({ lat, lng }, d) < d.radiusKm * 0.6 * 1.05));
}
function detourPoint(from, to, disaster) {
  const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
  let vx = mid.lng - disaster.lng, vy = mid.lat - disaster.lat;
  const len = Math.hypot(vx, vy) || 1; vx /= len; vy /= len;
  const pushKm = disaster.radiusKm * 0.6 + 4;
  return { lat: disaster.lat + vy * (pushKm / 111), lng: disaster.lng + vx * (pushKm / (111 * Math.cos(disaster.lat * Math.PI / 180))) };
}

/* Route from a disaster area (its people) to ITS nearest safe zone.
   The route starts inside its OWN disaster (it must exit it), but it
   must avoid every OTHER disaster's core. */
async function findRouteFrom(start, excludeIndex = -1) {
  const candidates = [...safeZones].map(z => ({ zone: z, straightKm: haversineKm(start, z) })).sort((a, b) => a.straightKm - b.straightKm).slice(0, 2);
  for (const { zone } of candidates) {
    const direct = await osrmRoute([start, zone]);
    if (!direct) break;
    if (!routeHitsCoreExcept(direct.coords, excludeIndex)) return { zone, route: direct };
    const blocker = disasters.find((d, di) => di !== excludeIndex && direct.coords.some(([lat, lng]) => haversineKm({ lat, lng }, d) < d.radiusKm * 0.6 * 1.05));
    if (blocker) {
      const detour = await osrmRoute([start, detourPoint(start, zone, blocker), zone]);
      if (detour && !routeHitsCoreExcept(detour.coords, excludeIndex)) return { zone, route: detour };
    }
  }
  const allByDistance = [...safeZones].sort((a, b) => haversineKm(start, a) - haversineKm(start, b));
  for (const zone of allByDistance.slice(0, 8)) {
    if (!routeHitsCoreExcept(straightLineCoords(start, zone, 60), excludeIndex)) return { zone, route: fallbackRoute(start, zone) };
  }
  const nearest = allByDistance[0];
  return { zone: nearest, route: fallbackRoute(start, nearest) };
}

// ---------- 7. Evacuate ONE disaster area's people (draw route + moving people + card) ----------
async function routeDisaster(disaster) {
  const index = disasters.indexOf(disaster);
  if (index < 0) return;
  const color = DISASTER_ROUTE_COLORS[index % DISASTER_ROUTE_COLORS.length];
  setStatus(`Evacuating people of Disaster ${index + 1} (${disaster.type}) — finding their nearest safe zone...`);

  const centre = { lat: disaster.lat, lng: disaster.lng };
  const external = await findRouteFrom(centre, index);
  if (!disasters.includes(disaster)) return; // area was cleared while routing
  let shelterRoute = await osrmRoute([centre, disaster.shelter]);
  if (!shelterRoute) shelterRoute = fallbackRoute(centre, disaster.shelter);

  // draw: white casing + coloured route to the safe zone, dashed teal route to its shelter
  const casing = L.polyline(external.route.coords, { color: "#ffffff", weight: 10, opacity: 0.7 }).addTo(map);
  const line = L.polyline(external.route.coords, { color, weight: 5, opacity: 0.95, dashArray: external.route.estimated ? "10 8" : null }).addTo(map)
    .bindPopup(`<b>Disaster ${index + 1} (${disaster.type})</b><br>People of this area → ${external.zone.name}`);
  const shelterLine = L.polyline(shelterRoute.coords, { color: "#0d9488", weight: 4, opacity: 0.9, dashArray: "6 6" }).addTo(map)
    .bindPopup(`<b>Disaster ${index + 1} shelter route</b><br>To its internal shelter (low-intensity area)`);
  routeLines.push(casing, line, shelterLine);

  // moving marker: the PEOPLE of this area travelling along the route to safety (loops)
  const peopleMarker = L.marker(external.route.coords[0], { icon: peopleIcon(color) }).addTo(map)
    .bindPopup(`<b>People of Disaster ${index + 1} area</b><br>Evacuating to ${external.zone.name}`);
  routeLines.push(peopleMarker);
  let step = 0;
  const stepSize = Math.max(1, Math.floor(external.route.coords.length / 50));
  const timer = setInterval(() => {
    step = (step + stepSize) % external.route.coords.length;
    peopleMarker.setLatLng(external.route.coords[step]);
  }, 150);
  evacTimers.push(timer);

  // card in the panel for this disaster area
  const tr = recommendTransport(external.route.distanceKm, disaster.type);
  const card = document.createElement("div");
  card.className = "disaster-route-card";
  card.id = "drc-" + index;
  card.innerHTML = `<div class="drc-head"><span class="chip" style="background:${color}"></span> Disaster ${index + 1} — ${disaster.type.toUpperCase()} area (${disaster.radiusKm} km radius)</div>
    <p><b>People of this area go to:</b> ${external.zone.name}</p>
    <p><b>Evacuation route:</b> ${external.route.distanceKm.toFixed(1)} km${external.route.estimated ? " (estimated)" : " by road"} &bull; <b>Internal shelter:</b> ${shelterRoute.distanceKm.toFixed(1)} km inside the low-intensity area</p>
    <p><b>Recommended transport for them:</b> ${tr.name} — Walk ${tr.times.walk} min | Bike ${tr.times.bike} min | Car ${tr.times.car} min</p>
    <p class="result-note">${tr.reason}</p>`;
  // keep cards in disaster order
  const listEl = document.getElementById("disasterRouteList");
  const existing = document.getElementById("drc-" + index);
  if (existing) existing.replaceWith(card); else listEl.appendChild(card);
  document.getElementById("disasterRoutes").classList.remove("hidden");
  setStatus(`Disaster ${index + 1}: people are being evacuated to ${external.zone.name} (${external.route.distanceKm.toFixed(1)} km).`);
}

// ---------- 8. Transport recommendation for the people of an area ----------
function recommendTransport(distanceKm, typeOverride) {
  const type = typeOverride || document.getElementById("disasterType").value;
  const people = parseInt(document.getElementById("peopleCount").value, 10);
  const vehicle = document.getElementById("vehicle").value;
  const times = { walk: Math.round((distanceKm / 5) * 60), bike: Math.round((distanceKm / 15) * 60), car: Math.round((distanceKm / 30) * 60) };
  let choice, reason;
  if (distanceKm <= 0.8) { choice = "walk"; reason = "The safe zone is very close to this area. Walking is fastest — no time wasted arranging vehicles."; }
  else if (people >= 6) { choice = (vehicle === "car" || vehicle === "both") ? "car" : "walk"; reason = choice === "car" ? "Many people live in this area. Cars can carry families and make repeat trips to evacuate everyone." : "Many people live here but no cars are available. They should walk together in groups along the marked route."; }
  else if (type === "flood" || type === "cyclone") { choice = (vehicle === "car" || vehicle === "both") ? "car" : "walk"; reason = "Flood / cyclone water can stall bikes. Cars have higher ground clearance. Without cars, people should walk only through shallow areas."; }
  else if (type === "earthquake" || type === "landslide") { choice = vehicle === "none" ? "walk" : "bike"; reason = "Debris blocks wide roads. Bikes can carry people through narrow gaps where cars cannot pass."; }
  else if (type === "fire") { choice = (vehicle === "car" || vehicle === "both") && distanceKm > 2 ? "car" : (vehicle === "none" ? "walk" : "bike"); reason = "Fire spreads fast, so speed matters most for the people here. " + (choice === "car" ? "A car also protects them from smoke and heat." : "A bike is quick and can leave before roads are blocked."); }
  else if (distanceKm > 25 && (vehicle === "car" || vehicle === "both")) { choice = "car"; reason = "The safe zone is far from this area. Cars are the fastest and safest option for its people."; }
  else if (vehicle !== "none") { choice = "bike"; reason = "Medium distance. Bikes are faster than walking and can move through traffic for the people of this area."; }
  else { choice = "walk"; reason = "No vehicles are available in this area, so its people should walk along the marked safe route."; }
  const meta = { walk: { icon: "fa-person-walking", name: "Walk" }, bike: { icon: "fa-motorcycle", name: "Bike / Scooter" }, car: { icon: "fa-car", name: "Car" } };
  return { ...meta[choice], reason, times };
}

// ---------- 9. UI wiring ----------
document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); currentMode = btn.dataset.mode;
  });
});
document.getElementById("clearBtn").addEventListener("click", clearAll);

// Recompute every disaster area's route (e.g. after changing people / vehicle settings)
document.getElementById("findRouteBtn").addEventListener("click", async () => {
  if (!disasters.length) { setStatus("No disaster on the map yet. Click the map to register one — its people will be evacuated automatically."); return; }
  const btn = document.getElementById("findRouteBtn");
  btn.disabled = true;
  clearRouteLines();
  document.getElementById("disasterRouteList").innerHTML = "";
  try {
    for (const d of [...disasters]) await routeDisaster(d);
    const all = routeLines.filter(l => l instanceof L.Polyline);
    if (all.length) map.fitBounds(L.featureGroup(all).getBounds(), { padding: [40, 40] });
  } finally { btn.disabled = false; }
});

// Presets (each registers one disaster - its people are routed automatically)
const presets = {
  "chennai-flood": () => { document.getElementById("disasterType").value = "flood"; document.getElementById("disasterSize").value = "10"; createDisaster(13.07, 80.29); map.setView([13.05, 80.25], 11); },
  "nilgiris-landslide": () => { document.getElementById("disasterType").value = "landslide"; document.getElementById("disasterSize").value = "5"; createDisaster(11.41, 76.695); map.setView([11.38, 76.72], 11); },
  "madurai-fire": () => { document.getElementById("disasterType").value = "fire"; document.getElementById("disasterSize").value = "5"; createDisaster(9.93, 78.13); map.setView([9.94, 78.12], 12); },
};
document.querySelectorAll(".preset-btn[data-preset]").forEach(btn => {
  btn.addEventListener("click", () => { clearAll(); presets[btn.dataset.preset](); });
});

// Search a place in Tamil Nadu
async function searchPlace() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return;
  setStatus("Searching for " + q + "...");
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q + ", Tamil Nadu, India")}`);
    const data = await res.json();
    if (data.length) { map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 12); setStatus("Found: " + data[0].display_name.split(",").slice(0, 3).join(",")); }
    else setStatus("Place not found. Try another name.");
  } catch { setStatus("Search failed — check internet connection."); }
}
document.getElementById("searchBtn").addEventListener("click", searchPlace);
document.getElementById("searchInput").addEventListener("keydown", e => { if (e.key === "Enter") searchPlace(); });

// Start map tiles
activateBase(0);

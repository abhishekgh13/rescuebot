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

/* Map tiles: Esri World Street Map is the default.
   WHY NOT the plain OpenStreetMap tile server? It BLOCKS pages that
   are opened as a local file / do not follow its tile usage policy
   (you see "403 Access blocked" tiles). Esri's street tiles show
   the same real Tamil Nadu roads and places, work from a local
   file and from GitHub Pages, and need no API key.
   The user can switch map styles with the layer button (top-right
   of the map): Street / Satellite / OpenStreetMap. */
const streetMap = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles © Esri — Source: Esri, OpenStreetMap contributors" }
);
const satelliteMap = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles © Esri — World Imagery" }
);
const osmMap = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "© OpenStreetMap contributors",
});
streetMap.addTo(map); // default view
L.control.layers(
  { "Street (Esri)": streetMap, "Satellite": satelliteMap, "OpenStreetMap": osmMap }
).addTo(map);

// ---------- 2. Data ----------
const TAMIL_NADU_SAFE_ZONES = [
  // Safe zones across Tamil Nadu (relief centres in major towns / cities)
  { name: "Chennai Relief Centre", lat: 13.0580, lng: 80.2780 },
  { name: "Kanchipuram Relief Centre", lat: 12.8342, lng: 79.7036 },
  { name: "Tiruvannamalai Relief Centre", lat: 12.2253, lng: 79.0747 },
  { name: "Vellore Relief Centre", lat: 12.9165, lng: 79.1325 },
  { name: "Villupuram Relief Centre", lat: 11.9401, lng: 79.4861 },
  { name: "Cuddalore Relief Centre", lat: 11.7560, lng: 79.7560 },
  { name: "Salem Relief Centre", lat: 11.6643, lng: 78.1460 },
  { name: "Dharmapuri Relief Centre", lat: 12.1211, lng: 78.1582 },
  { name: "Erode Relief Centre", lat: 11.3410, lng: 77.7172 },
  { name: "Tiruppur Relief Centre", lat: 11.1085, lng: 77.3411 },
  { name: "Coimbatore Relief Centre", lat: 11.0060, lng: 76.9700 },
  { name: "Pollachi Relief Centre", lat: 10.6629, lng: 77.0065 },
  { name: "Ooty (Udhagamandalam) Relief Centre", lat: 11.4102, lng: 76.6950 },
  { name: "Namakkal Relief Centre", lat: 11.2189, lng: 78.1674 },
  { name: "Karur Relief Centre", lat: 10.9601, lng: 78.0766 },
  { name: "Dindigul Relief Centre", lat: 10.3673, lng: 77.9803 },
  { name: "Trichy Relief Centre", lat: 10.7905, lng: 78.7047 },
  { name: "Thanjavur Relief Centre", lat: 10.7870, lng: 79.1378 },
  { name: "Kumbakonam Relief Centre", lat: 10.9601, lng: 79.3845 },
  { name: "Pudukkottai Relief Centre", lat: 10.3833, lng: 78.8001 },
  { name: "Nagapattinam Relief Centre", lat: 10.7672, lng: 79.8449 },
  { name: "Madurai Relief Centre", lat: 9.9252, lng: 78.1198 },
  { name: "Virudhunagar Relief Centre", lat: 9.5680, lng: 77.9624 },
  { name: "Sivaganga Relief Centre", lat: 9.8433, lng: 78.4809 },
  { name: "Ramanathapuram Relief Centre", lat: 9.3639, lng: 78.8395 },
  { name: "Tirunelveli Relief Centre", lat: 8.7139, lng: 77.7567 },
  { name: "Thoothukudi Relief Centre", lat: 8.7642, lng: 78.1348 },
  { name: "Kanyakumari Relief Centre", lat: 8.0883, lng: 77.5385 },
];

let safeZones = [...TAMIL_NADU_SAFE_ZONES];
let disasters = [];              // { lat, lng, radiusKm, type, layers: [] }
let currentMode = "disaster";
let routeLines = []; // two routes are drawn: A (shelter) and B (external)

// My location — default: Karunya University, Coimbatore
let personLatLng = L.latLng(10.9367, 76.7447);

/* Professional radar-style markers (Font Awesome icons, no emojis).
   Each marker is a solid pin with expanding radar rings, like an
   emergency control-room / radar display. Styles are in style.css. */
function radarIcon(kind, faClass, extraClass = "") {
  return L.divIcon({
    className: "custom-marker",
    html: `<div class="mkr ${kind} ${extraClass}"><span class="radar-ring"></span><span class="radar-ring r2"></span><span class="mkr-core"><i class="fa-solid ${faClass}"></i></span></div>`,
    iconSize: [40, 40], iconAnchor: [20, 20],
  });
}
const personIcon = () => radarIcon("mkr-person", "fa-robot");
const safeIcon = () => radarIcon("mkr-safe", "fa-shield-halved");
const shelterIcon = () => radarIcon("mkr-shelter", "fa-house-medical");
function disasterFaClass(type) {
  return { flood: "fa-water", fire: "fa-fire", earthquake: "fa-house-crack", landslide: "fa-hill-rockslide", cyclone: "fa-hurricane" }[type] || "fa-triangle-exclamation";
}

// Person / RescueBot marker (draggable)
const personMarker = L.marker(personLatLng, { icon: personIcon(), draggable: true })
  .addTo(map).bindPopup("<b>Your Location</b><br>Drag this marker, or use 'My Location' mode and click the map.");
personMarker.on("dragend", () => { personLatLng = personMarker.getLatLng(); hideResults(); });

// Safe zone markers
let safeZoneMarkers = [];
function drawSafeZones() {
  safeZoneMarkers.forEach(m => map.removeLayer(m));
  safeZoneMarkers = safeZones.map(z =>
    L.marker([z.lat, z.lng], { icon: safeIcon() }).addTo(map).bindPopup(`<b>Safe Zone</b><br>${z.name}`)
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
function currentDisasterType() { return document.getElementById("disasterType").value; }

// ---------- 4. Clicking the real map = creating the scenario ----------
map.on("click", (e) => {
  hideResults();
  if (currentMode === "person") {
    personLatLng = e.latlng;
    personMarker.setLatLng(e.latlng);
  } else if (currentMode === "safezone") {
    const z = { name: "Custom Safe Zone " + (safeZones.length - 27), lat: e.latlng.lat, lng: e.latlng.lng };
    safeZones.push(z); drawSafeZones();
  } else {
    createDisaster(e.latlng.lat, e.latlng.lng);
  }
});

function createDisaster(lat, lng) {
  const type = document.getElementById("disasterType").value;
  const radiusKm = parseInt(document.getElementById("disasterSize").value, 10);

  /* Disaster intensity model:
     - CORE (0-60% of radius): high intensity - no one should enter, routes avoid it
     - LOW INTENSITY (60-100% of radius): outer part of the disaster - safer,
       so the internal safe shelter is placed here
     - DANGER PERIMETER (100-150%): caution area around the disaster */

  // Internal shelter: placed inside the low-intensity area, on the side
  // facing the user, at 80% of the disaster radius from the centre.
  const start = { lat: personLatLng.lat, lng: personLatLng.lng };
  let vx = start.lng - lng, vy = start.lat - lat;
  const vlen = Math.hypot(vx, vy) || 1; vx /= vlen; vy /= vlen;
  const shelterKm = radiusKm * 0.8;
  const shelter = {
    name: "Internal Safe Shelter (" + type + " - low intensity area)",
    lat: lat + vy * (shelterKm / 111),
    lng: lng + vx * (shelterKm / (111 * Math.cos(lat * Math.PI / 180))),
  };

  const layers = [
    // danger perimeter (150% radius, amber, very light)
    L.circle([lat, lng], { radius: radiusKm * 1500, color: "#f59e0b", weight: 1, fillColor: "#f59e0b", fillOpacity: 0.10 }).addTo(map),
    // low-intensity area (full radius, orange)
    L.circle([lat, lng], { radius: radiusKm * 1000, color: "#ea580c", weight: 1, fillColor: "#fb923c", fillOpacity: 0.28 }).addTo(map)
      .bindPopup(`<b>${type.toUpperCase()} - LOW INTENSITY AREA</b><br>Outer part of the disaster (${radiusKm} km radius). The internal safe shelter is located here.`),
    // high-intensity core (60% radius, dark red)
    L.circle([lat, lng], { radius: radiusKm * 600, color: "#991b1b", weight: 2, fillColor: "#dc2626", fillOpacity: 0.55 }).addTo(map)
      .bindPopup(`<b>${type.toUpperCase()} - HIGH INTENSITY CORE</b><br>Most dangerous part of the disaster. All routes avoid this core.`),
    L.marker([lat, lng], { icon: radarIcon("mkr-disaster", disasterFaClass(type), type) }).addTo(map),
    // internal safe shelter inside the low-intensity area
    L.marker([shelter.lat, shelter.lng], { icon: shelterIcon() }).addTo(map)
      .bindPopup(`<b>Internal Safe Shelter</b><br>Safe place INSIDE the disaster area, in the low-intensity zone.<br>Route A leads here.`),
  ];
  disasters.push({ lat, lng, radiusKm, type, shelter, layers });
}
function clearDisasters() {
  disasters.forEach(d => d.layers.forEach(l => map.removeLayer(l)));
  disasters = []; hideResults(); clearRouteLines();
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

// Does this road route pass through any disaster CORE (high intensity)?
// Passing through the low-intensity outer area is allowed.
function routeHitsCore(coords) {
  if (!disasters.length) return false;
  return coords.some(([lat, lng]) =>
    disasters.some(d => haversineKm({ lat, lng }, d) < d.radiusKm * 0.6 * 1.05)
  );
}

// A point pushed away from the disaster, used as a detour waypoint
function detourPoint(from, to, disaster) {
  const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
  let vx = mid.lng - disaster.lng, vy = mid.lat - disaster.lat;
  const len = Math.hypot(vx, vy) || 1; vx /= len; vy /= len;
  const pushKm = disaster.radiusKm * 0.6 + 4; // push around the core, not the whole disaster
  // 1 degree lat ≈ 111 km, 1 degree lng ≈ 111*cos(lat) km
  return { lat: disaster.lat + vy * (pushKm / 111), lng: disaster.lng + vx * (pushKm / (111 * Math.cos(disaster.lat * Math.PI / 180))) };
}

/* ROUTE B - Find the best EXTERNAL safe zone (outside the disaster):
   - try nearest Tamil Nadu safe zones first
   - prefer a direct road route that avoids the disaster CORE
   - else try a detour route around the core
   - else (only if forced) use the shortest direct route + warning */
async function findExternalRoute() {
  const start = { lat: personLatLng.lat, lng: personLatLng.lng };
  const candidates = [...safeZones]
    .map(z => ({ zone: z, straightKm: haversineKm(start, z) }))
    .sort((a, b) => a.straightKm - b.straightKm)
    .slice(0, 5);

  let fallback = null;
  for (const { zone } of candidates) {
    const direct = await osrmRoute([start, zone]);
    if (!direct) continue;
    if (!routeHitsCore(direct.coords)) return { zone, route: direct, note: "Direct road route to safety outside the disaster - it does not pass through the high-intensity core." };
    if (!fallback) fallback = { zone, route: direct, note: "Warning: every road route passes near the disaster core. This is the shortest one - travel with caution." };

    const blocker = disasters.find(d => direct.coords.some(([lat, lng]) => haversineKm({ lat, lng }, d) < d.radiusKm * 0.6 * 1.05));
    if (blocker) {
      const via = detourPoint(start, zone, blocker);
      const detour = await osrmRoute([start, via, zone]);
      if (detour && !routeHitsCore(detour.coords)) {
        return { zone, route: detour, note: "The direct road passed through the disaster core, so this route is diverted around it to the safe zone outside." };
      }
    }
  }
  return fallback;
}

/* ROUTE A - Find the route to the INTERNAL SAFE SHELTER, which is inside
   the disaster area but in its low-intensity outer zone. This is the
   quick, immediate-safety option when escaping outside takes too long. */
async function findShelterRoute() {
  if (!disasters.length) return null;
  const start = { lat: personLatLng.lat, lng: personLatLng.lng };
  const shelters = disasters.map(d => d.shelter).sort((a, b) => haversineKm(start, a) - haversineKm(start, b));
  for (const shelter of shelters) {
    const route = await osrmRoute([start, shelter]);
    if (route) {
      const crossesCore = routeHitsCore(route.coords);
      return { zone: shelter, route, note: crossesCore
        ? "Immediate refuge inside the disaster's low-intensity area. Note: this shortest road passes close to the core - proceed with caution."
        : "Immediate refuge inside the disaster's low-intensity area - the road stays out of the high-intensity core." };
    }
  }
  return null;
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
    walk: { icon: "fa-person-walking", name: "Walk" },
    bike: { icon: "fa-motorcycle", name: "Bike / Scooter" },
    car: { icon: "fa-car", name: "Car" },
  };
  return { ...meta[choice], reason, times };
}

// ---------- 6. UI wiring ----------
function hideResults() {
  document.getElementById("result").classList.add("hidden");
  document.getElementById("noRoute").classList.add("hidden");
}
function setStatus(msg) { document.getElementById("status").textContent = msg; }

function clearRouteLines() { routeLines.forEach(l => map.removeLayer(l)); routeLines = []; }

function fillRouteCard(prefix, found, notAvailableText) {
  const dest = document.getElementById(prefix + "_dest");
  if (!found) {
    dest.innerHTML = "<b>Status:</b> " + notAvailableText;
    document.getElementById(prefix + "_dist").textContent = "";
    document.getElementById(prefix + "_note").textContent = "";
    document.getElementById(prefix + "_transport").textContent = "-";
    document.getElementById(prefix + "_times").textContent = "";
    document.getElementById(prefix + "_reason").textContent = "";
    document.getElementById(prefix + "_icon").innerHTML = '<i class="fa-solid fa-ban"></i>';
    return;
  }
  const tr = recommendTransport(found.route.distanceKm);
  dest.innerHTML = "<b>Destination:</b> " + found.zone.name;
  document.getElementById(prefix + "_dist").innerHTML = "<b>Distance (by road):</b> " + found.route.distanceKm.toFixed(1) + " km";
  document.getElementById(prefix + "_note").textContent = found.note;
  document.getElementById(prefix + "_icon").innerHTML = `<i class="fa-solid ${tr.icon}"></i>`;
  document.getElementById(prefix + "_transport").textContent = "Recommended: " + tr.name;
  document.getElementById(prefix + "_times").textContent = `Walk ${tr.times.walk} min | Bike ${tr.times.bike} min | Car ${tr.times.car} min`;
  document.getElementById(prefix + "_reason").textContent = tr.reason;
}

document.getElementById("findRouteBtn").addEventListener("click", async () => {
  hideResults();
  const btn = document.getElementById("findRouteBtn");
  btn.disabled = true; setStatus("Computing Route A (internal shelter) and Route B (external safe zone)...");
  try {
    // Compute BOTH routes
    const [routeA, routeB] = await Promise.all([findShelterRoute(), findExternalRoute()]);
    if (!routeA && !routeB) { document.getElementById("noRoute").classList.remove("hidden"); setStatus(""); return; }

    clearRouteLines();
    const group = [];
    if (routeA) { const lineA = L.polyline(routeA.route.coords, { color: "#0d9488", weight: 6, opacity: 0.9 }).addTo(map).bindPopup("<b>Route A</b> - to the Internal Safe Shelter (inside, low intensity)"); routeLines.push(lineA); group.push(lineA); }
    if (routeB) { const lineB = L.polyline(routeB.route.coords, { color: "#2563eb", weight: 6, opacity: 0.9 }).addTo(map).bindPopup("<b>Route B</b> - to the external Safe Zone (outside the disaster)"); routeLines.push(lineB); group.push(lineB); }
    if (group.length) map.fitBounds(L.featureGroup(group).getBounds(), { padding: [40, 40] });

    fillRouteCard("resA", routeA, "Not available - create a disaster on the map first. A shelter is placed inside it automatically, in the low-intensity area.");
    fillRouteCard("resB", routeB, "No external road route could be computed.");
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

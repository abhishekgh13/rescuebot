/* =========================================================
   RescueBot — Disaster Rescue Route Finder
   Intelligent Robotics Project (Website only, no IoT)

   Idea:
   1. PERCEIVE  - User clicks the map to create a disaster scenario
   2. DECIDE    - A* algorithm finds the safest route to a safe zone
   3. ACT       - Route is drawn + animated, and a transport
                  (Walk / Bike / Car) is recommended by simple rules
   ========================================================= */

// ---------- Map settings ----------
const COLS = 24;              // map width  (cells)
const ROWS = 16;              // map height (cells)
const CELL_METERS = 120;      // 1 cell = 120 metres in real life

// Cell types: empty | disaster | danger | blocked | safe
let grid = [];
let person = { x: 2, y: 13 };            // start location (bottom-left)
let safeZones = [
  { x: 21, y: 2,  name: "Hospital Safe Zone" },
  { x: 21, y: 13, name: "School Safe Zone" },
  { x: 11, y: 1,  name: "Open Ground Safe Zone" },
];
let currentMode = "disaster";
let currentPath = [];
let animationTimer = null;

const mapEl = document.getElementById("map");
mapEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;

// ---------- Build / reset the grid ----------
function resetGrid() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill("empty"));
  person = { x: 2, y: 13 };
  safeZones = [
    { x: 21, y: 2,  name: "Hospital Safe Zone" },
    { x: 21, y: 13, name: "School Safe Zone" },
    { x: 11, y: 1,  name: "Open Ground Safe Zone" },
  ];
  currentPath = [];
  stopAnimation();
  hideResults();
  draw();
}

// ---------- Draw the map ----------
function draw(pathCells = []) {
  const pathSet = new Set(pathCells.map(p => p.x + "," + p.y));
  mapEl.innerHTML = "";

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const type = grid[y][x];

      if (type !== "empty") cell.classList.add(type);
      if (pathSet.has(x + "," + y)) cell.classList.add("path");

      // Icons
      const safe = safeZones.find(s => s.x === x && s.y === y);
      if (safe) { cell.classList.add("safe"); cell.textContent = "🏥"; if (safe.name.includes("School")) cell.textContent = "🏫"; if (safe.name.includes("Ground")) cell.textContent = "🏕️"; }
      else if (type === "disaster") cell.textContent = disasterIcon();
      else if (type === "blocked") cell.textContent = "🚧";

      if (person.x === x && person.y === y) { cell.classList.add("person"); cell.textContent = "🤖"; }

      cell.addEventListener("click", () => onCellClick(x, y));
      mapEl.appendChild(cell);
    }
  }
}

function disasterIcon() {
  const t = document.getElementById("disasterType").value;
  return { flood: "🌊", fire: "🔥", earthquake: "🏚️", landslide: "⛰️" }[t] || "⚠️";
}

// ---------- Clicking the map = creating the scenario ----------
function onCellClick(x, y) {
  hideResults();
  currentPath = [];
  stopAnimation();

  if (currentMode === "person") {
    if (grid[y][x] !== "disaster") person = { x, y };
  }
  else if (currentMode === "safezone") {
    if (!safeZones.some(s => s.x === x && s.y === y)) {
      safeZones.push({ x, y, name: "Safe Zone " + (safeZones.length + 1) });
    }
  }
  else if (currentMode === "block") {
    grid[y][x] = grid[y][x] === "blocked" ? "empty" : "blocked";
  }
  else if (currentMode === "erase") {
    grid[y][x] = "empty";
    safeZones = safeZones.filter(s => !(s.x === x && s.y === y));
    refreshDangerRing();
  }
  else { // disaster mode
    createDisaster(x, y);
  }
  draw();
}

// Create a disaster: centre cells + a danger ring around them.
// The robot must avoid BOTH - just like a real unsafe area.
function createDisaster(cx, cy) {
  const radius = parseInt(document.getElementById("disasterSize").value, 10);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy)); // square radius
      if (d <= radius) grid[y][x] = "disaster";
      else if (d === radius + 1 && grid[y][x] === "empty") grid[y][x] = "danger";
    }
  }
  // Never trap the person / safe zones inside the icon rendering
  safeZones = safeZones.filter(s => grid[s.y][s.x] !== "disaster");
}

// After erasing, rebuild danger rings around remaining disasters (simple pass)
function refreshDangerRing() {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === "danger") grid[y][x] = "empty";
  const disasters = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === "disaster") disasters.push({ x, y });
  disasters.forEach(({ x, y }) => {
    [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && grid[ny][nx] === "empty") grid[ny][nx] = "danger";
    });
  });
}

/* =========================================================
   A* PATH FINDING  (the "intelligence" of RescueBot)
   - Cost 1 for a normal cell, cost 5 for a danger cell
     (robot prefers to stay far from danger, but can pass
      through a danger edge if there is no other way)
   - Disaster and blocked cells are never allowed
   ========================================================= */
function isWalkable(x, y) {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS && grid[y][x] !== "disaster" && grid[y][x] !== "blocked";
}
function stepCost(x, y) { return grid[y][x] === "danger" ? 5 : 1; }
function heuristic(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function findPathAStar(start, goal) {
  const open = [{ ...start, g: 0, f: heuristic(start, goal), parent: null }];
  const closed = new Map();
  const key = (x, y) => x + "," + y;

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    if (current.x === goal.x && current.y === goal.y) {
      const path = [];
      let node = current;
      while (node) { path.unshift({ x: node.x, y: node.y }); node = node.parent; }
      return path;
    }
    closed.set(key(current.x, current.y), current.g);

    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = current.x + dx, ny = current.y + dy;
      if (!isWalkable(nx, ny)) continue;
      const g = current.g + stepCost(nx, ny);
      if (closed.has(key(nx, ny)) && closed.get(key(nx, ny)) <= g) continue;
      const existing = open.find(n => n.x === nx && n.y === ny);
      if (!existing || g < existing.g) {
        const node = { x: nx, y: ny, g, f: g + heuristic({ x: nx, y: ny }, goal), parent: current };
        if (existing) Object.assign(existing, node); else open.push(node);
      }
    }
  }
  return null; // no route
}

// Find the nearest reachable safe zone
function findNearestSafeZone() {
  let best = null;
  for (const zone of safeZones) {
    const path = findPathAStar(person, zone);
    if (path && (!best || path.length < best.path.length)) best = { zone, path };
  }
  return best;
}

/* =========================================================
   TRANSPORT RECOMMENDATION  (simple rule-based AI)
   Inputs : distance, disaster type, people, vehicle available
   Output : Walk / Bike / Car + reason + time for each option
   ========================================================= */
function recommendTransport(distanceMeters) {
  const type = document.getElementById("disasterType").value;
  const people = parseInt(document.getElementById("peopleCount").value, 10);
  const vehicle = document.getElementById("vehicle").value;
  const km = distanceMeters / 1000;

  const times = {
    walk: Math.round((km / 5) * 60),    // 5 km/h
    bike: Math.round((km / 15) * 60),   // 15 km/h
    car:  Math.round((km / 30) * 60),   // 30 km/h (city)
  };

  let choice, reason;
  if (distanceMeters <= 800) {
    choice = "walk";
    reason = "The safe zone is very close. Walking is fastest — no time wasted starting a vehicle, and roads near a disaster may be jammed.";
  } else if (people >= 6) {
    choice = vehicle === "bike" || vehicle === "none" ? "walk" : "car";
    reason = "You are a large group. A car keeps everyone together and can make repeat trips. If no car is available, walk together in a group.";
    if (choice === "walk") reason = "You are a large group but no car is available. Walk together in a group and stay on the marked route.";
  } else if (type === "flood") {
    choice = vehicle === "none" || vehicle === "bike" ? "walk" : "car";
    reason = "Flood water is dangerous and can stall a bike/scooter. A car has higher ground clearance. If no car, walk through shallow areas only — do not use a bike in deep water.";
  } else if (type === "earthquake" || type === "landslide") {
    choice = vehicle === "none" ? "walk" : "bike";
    reason = "Earthquake / landslide debris blocks wide roads. A bike can pass through narrow gaps where a car cannot, so it escapes faster.";
  } else if (type === "fire") {
    choice = distanceMeters > 2000 && vehicle !== "none" && vehicle !== "bike" ? "car" : (vehicle === "none" ? "walk" : "bike");
    reason = "Fire spreads fast, so speed matters most. " + (choice === "car" ? "A car also protects you from smoke and heat." : "A bike is quick and can escape before roads get blocked by smoke / traffic.");
  } else if (distanceMeters > 2500 && (vehicle === "car" || vehicle === "both")) {
    choice = "car";
    reason = "The safe zone is far. A car is the fastest and safest option for this distance.";
  } else if (vehicle !== "none") {
    choice = "bike";
    reason = "Medium distance. A bike is faster than walking and can move through traffic near the disaster area.";
  } else {
    choice = "walk";
    reason = "No vehicle is available, so walking on the marked safe route is the best option.";
  }

  const meta = {
    walk: { icon: "🚶", name: "Walk", minutes: times.walk },
    bike: { icon: "🏍️", name: "Bike / Scooter", minutes: times.bike },
    car:  { icon: "🚗", name: "Car", minutes: times.car },
  };
  return { ...meta[choice], reason, times };
}

// ---------- Directions from a path (e.g. "Go Right x 4") ----------
function buildDirections(path) {
  if (path.length < 2) return ["You are already at the safe zone."];
  const names = [];
  let prev = null, count = 0;
  const label = (dx, dy) => dx === 1 ? "Right ➡" : dx === -1 ? "⬅ Left" : dy === 1 ? "Down ⬇" : "⬆ Up";
  for (let i = 1; i < path.length; i++) {
    const d = label(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (d === prev) count++;
    else { if (prev) names.push(`Go ${prev} — ${count} step${count > 1 ? "s" : ""}`); prev = d; count = 1; }
  }
  if (prev) names.push(`Go ${prev} — ${count} step${count > 1 ? "s" : ""}`);
  names.push("🏁 You have reached the safe zone.");
  return names;
}

// ---------- Animate RescueBot along the route ----------
function stopAnimation() { if (animationTimer) { clearInterval(animationTimer); animationTimer = null; } }
function animatePath(path, done) {
  stopAnimation();
  const original = { ...person };
  let i = 0;
  animationTimer = setInterval(() => {
    if (i >= path.length) { stopAnimation(); person = original; draw(path); if (done) done(); return; }
    person = { ...path[i] };
    draw(path);
    i++;
  }, 220);
}

// ---------- Main button ----------
function hideResults() {
  document.getElementById("result").classList.add("hidden");
  document.getElementById("noRoute").classList.add("hidden");
}

document.getElementById("findRouteBtn").addEventListener("click", () => {
  hideResults();
  const found = findNearestSafeZone();

  if (!found) {
    document.getElementById("noRoute").classList.remove("hidden");
    draw();
    return;
  }

  currentPath = found.path;
  const distanceMeters = (found.path.length - 1) * CELL_METERS;
  const transport = recommendTransport(distanceMeters);

  document.getElementById("resultSafeZone").innerHTML = `<b>Nearest safe zone:</b> ${found.zone.name}`;
  document.getElementById("resultDistance").innerHTML = `<b>Route distance:</b> ${distanceMeters} m (${(distanceMeters / 1000).toFixed(2)} km) &bull; ${found.path.length - 1} steps`;
  document.getElementById("transportIcon").textContent = transport.icon;
  document.getElementById("transportName").textContent = transport.name;
  document.getElementById("transportReason").textContent = transport.reason;
  document.getElementById("transportTimes").textContent =
    `⏱ Walk: ${transport.times.walk} min • Bike: ${transport.times.bike} min • Car: ${transport.times.car} min`;
  document.getElementById("directions").innerHTML = buildDirections(found.path).map(d => `<li>${d}</li>`).join("");
  document.getElementById("result").classList.remove("hidden");

  draw(found.path);
  animatePath(found.path);
});

// ---------- Toolbar / presets ----------
document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
  });
});
document.getElementById("clearBtn").addEventListener("click", resetGrid);

const presets = {
  flood:      () => { document.getElementById("disasterType").value = "flood"; createDisaster(10, 8); createDisaster(13, 10); },
  fire:       () => { document.getElementById("disasterType").value = "fire"; createDisaster(12, 7); },
  earthquake: () => { document.getElementById("disasterType").value = "earthquake"; createDisaster(9, 6); createDisaster(15, 11); grid[8][6] = "blocked"; grid[9][17] = "blocked"; grid[5][14] = "blocked"; },
};
document.querySelectorAll(".preset-btn[data-preset]").forEach(btn => {
  btn.addEventListener("click", () => { resetGrid(); presets[btn.dataset.preset](); draw(); });
});

// ---------- Start ----------
resetGrid();

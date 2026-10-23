# RescueBot — Disaster Rescue Route Finder

**Subject:** Intelligent Robotics (24AI2003)
**Type:** Website only — no IoT, no hardware. Runs on a laptop in a browser.

## Idea in one line
Click on a map to create a natural disaster scenario. RescueBot finds the
safest route to the nearest safe zone and recommends the best transport —
walk, bike, or car.

## How it works (Perceive → Decide → Act)
1. **Perceive** — The user clicks the map to place a disaster (flood, fire,
   earthquake, landslide), blocked roads, their own location and safe zones.
2. **Decide** — The A* path-finding algorithm searches for the shortest safe
   route, avoiding disaster cells completely and preferring to stay away
   from danger-ring cells (cost 5 instead of 1).
3. **Act** — The route is drawn and animated on the map, turn-by-turn
   directions are shown, and a rule-based system recommends transport:
   - Short distance (≤ 800 m) → **Walk**
   - Flood → **Car** (bike can stall in water)
   - Earthquake / landslide → **Bike** (can pass narrow debris gaps)
   - Fire / long distance → **Car**, otherwise **Bike**
   - Large group / family → **Car** if available

## How to run
1. Open this folder in **VS Code**
2. Open `index.html` in a browser — or use the VS Code **Live Server**
   extension and click "Go Live"
3. No installation, no server, no internet needed

## How to demo
1. Click **Quick scenarios → Flood** (or click anywhere on the map in
   "Create Disaster" mode)
2. Check your location is set (purple robot icon — move it with
   "My Location" mode)
3. Select the number of people and vehicle available
4. Click **Find Safe Route** — RescueBot draws and animates the escape
   route and recommends transport with a reason and travel times

## Files
- `index.html` — page structure
- `style.css` — design of the map and panel
- `script.js` — map logic, A* algorithm, transport recommendation

## Concepts used from class
- Robot perception, decision-making and autonomous action
- Path planning (A* algorithm)
- Rule-based intelligent systems
- Robot simulation in software

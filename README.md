# RescueBot — Disaster Rescue Route Finder (Real Map of Tamil Nadu)

**Subject:** Intelligent Robotics (24AI2003)
**Type:** Website only — no IoT, no hardware. Runs on a laptop in a browser.
**New in this version:** a REAL map of Tamil Nadu, India (like Google Maps)
with REAL road routes — not a grid / simulation map.

## Idea in one line
Click on the real map of Tamil Nadu to create a natural disaster scenario.
RescueBot finds the real road route to the nearest safe zone and recommends
the best transport — walk, bike, or car.

## Why not Google Maps directly?
Google Maps needs a paid API key to use inside a website. This project uses
**Leaflet + Esri World Street Map / OpenStreetMap data** instead — the same
real roads, cities and places of Tamil Nadu, completely free, no API key,
no billing. Road routes come from the free **OSRM** routing service.
Internet is needed to load the map.

> **Fix note (v5):** the plain OpenStreetMap tile server blocks some pages
> ("403 Access blocked" tiles), so it is **not used at all**. The map now
> has **four independent tile providers** (Esri Street, OSM Germany,
> OSM France, Esri Satellite) with **automatic fallback** — if the active
> provider is blocked on your network, the map switches itself to the
> next one. The active provider is shown under the map ("Map source: ...")
> and the header shows "v5 Auto-Fallback Map" so you can confirm you are
> running the latest files. If you still see blocked tiles, you are
> opening an OLD copy of the project — delete it and download the repo
> again fresh, then press Ctrl+F5 in the browser.

## How it works (Perceive → Decide → Act)
1. **Perceive** — The user clicks the real map to place a disaster
   (flood, fire, earthquake, landslide, cyclone — 5 / 10 / 20 km radius),
   sets their location, and can add safe zones. Pre-loaded safe zones are
   relief centres in Coimbatore, Chennai, Madurai, Trichy, Salem,
   Thanjavur, Tirunelveli, Vellore, Erode and Kanyakumari.
2. **Decide** — The disaster is modelled in intensity tiers: a
   **high-intensity core** (routes must avoid it) and a **low-intensity
   outer area**, where an **internal safe shelter is automatically
   placed inside the disaster**. RescueBot then computes **two routes**:
   - **Route A (teal)** — to the internal shelter inside the
     low-intensity area: immediate refuge, usually shorter
   - **Route B (blue)** — to the nearest **external** safe zone
     (28 relief centres across Tamil Nadu), avoiding the core, with a
     detour around the core if the direct road is blocked
3. **Act** — Both routes are drawn on the real map and a rule-based system
   recommends transport for each route:
   - Short distance (≤ 800 m) → **Walk**
   - Flood / Cyclone → **Car** (bike can stall in water)
   - Earthquake / Landslide → **Bike** (passes narrow debris gaps)
   - Fire / long distance → **Car**, otherwise **Bike**

## How to run
1. Clone / download this repo and open the folder in **VS Code**
2. Open `index.html` with **Live Server** (or any local server)
3. Internet must be ON — the map, search and road routing load online

> Note: opening `index.html` by double-clicking also works in most
> browsers, but Live Server is recommended.

## How to demo
1. The map opens on **Tamil Nadu**. Your location starts at Karunya
   University, Coimbatore (drag the blue radar marker to move it)
2. Click the **Flood — Chennai** preset — or click anywhere on the map
   in "Create Disaster" mode to make your own disaster
3. Search any place using the search box (e.g. "Madurai")
4. Select people + vehicle, click **Find Safe Route**
5. RescueBot draws the real road route to the nearest safe zone and
   recommends walk / bike / car with a reason and travel times

## Design
Professional emergency-dashboard theme: no emojis anywhere in the
interface. All markers are radar-style pins (Font Awesome icons with
expanding radar rings) — blue for your location, red/colour-coded
warning markers for disasters, green shield markers for safe zones.

## Files
- `index.html` — page structure
- `style.css` — design
- `script.js` — real map (Leaflet), disaster logic, OSRM road routing
  with disaster avoidance + detour, transport recommendation

## Concepts used from class
- Robot perception, decision-making and autonomous action
- Path planning on a real road network
- Rule-based intelligent systems
- Robot simulation in software

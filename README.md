# 🏃‍♂️ Run Map - Interactive Run Map

An elegant, dependency-free, interactive map showcasing running activities tracked via **Google Fit** and **Strava**. This site is built with modern ES6 Javascript, HTML5, Tailwind CSS, and Leaflet.js, and is optimized to be hosted completely for free on **GitHub Pages**.

_Coded with the help of **Gemini 3.5 Flash**._

## ✨ Features

- 🗺️ **Interactive Leaflet Map**: Smoothly overlays GPS routes with no API keys required.
- 📊 **Dynamic Statistics & Location Filters**: Auto-calculates total runs, total distance, total cumulative time, and weighted average pace globally, or filters specifically by selected cities/locations.
- 📱 **Responsive Dual-Panel UI**: Designed to work flawlessly on desktop monitors and mobile touch screens alike, with a thin mobile header and a fully scrollable sidebar on mobile screens.
- ⚡ **Highly Performant**: Pre-parses raw XML/GPX files on your machine to a compressed JSON structure, leading to instant loading times.
- 📍 **Two-Way Synchronization**: Hovering/clicking sidebar cards highlights the corresponding track on the map, and clicking a track on the map selects and pans the sidebar card.
- 🔄 **Auto-centering & Zoom**: No hardcoded coordinate maps! The frontend automatically fits the map bounding envelope to wherever your runs actually took place.
- 🗺️ **Reverse Geocoding & Local Caching**: Automatically resolves coordinates to city/country names using the OpenStreetMap Nominatim API, utilizing a local cache (`data/.geocoding_cache.json`) to limit and optimize network queries.

---

## 📥 How to Export Your Google Fit Data

To export your historical GPS runs from Google Fit:

1. Visit **[Google Takeout](https://takeout.google.com/)**.
2. Click **Deselect all**, then scroll down to check **Google Fit**.
3. Under the Google Fit section, make sure "All Fit data included" is active (or verify **Activities** are selected, which are formatted as TCX files).
4. Scroll to the bottom and click **Next step**.
5. Keep delivery method as "Send download link via email", file type as **.zip**, size as "2GB", and click **Create export**.
6. Wait for Google's notification, download the zip, and extract it on your computer.
7. Open the extracted folder, navigate to `Takeout/Google Fit/Activities`, and look for your `.tcx` files (e.g. `2026-06-15T08_00_00Z_Running.tcx`).
8. Copy all the `.tcx` files you want to display, and paste them into the **`data/raw/`** folder of this repository.

---

## 📥 How to Export Your Strava Data

You can export your activities from Strava either in bulk (all historical runs) or individually.

### Option A: Bulk Export (Recommended for history)

1. Log into your **[Strava Account](https://www.strava.com/)** on a desktop or laptop web browser (not the mobile app).
2. Hover over your profile picture in the top-right corner and click **Settings**.
3. In the left-hand navigation menu, select **My Account**.
4. Scroll down to the **Download or Delete Your Account** section, and click **Get Started**.
5. Under section 2 (**Download Request**), click the **Request Your Archive** button.
6. Strava will bundle your historical activities and send a download link to your registered email (this may take anywhere from a few minutes to a few hours depending on your activity volume).
7. Once the email arrives, click the link to download the `.zip` file.
8. Extract the archive and open the extracted folder.
9. Navigate to the **`activities/`** directory. Inside, you'll find your runs (usually formatted as `.gpx` or `.tcx` files).
   _(Note: If some files are compressed as `.gpx.gz` or `.tcx.gz`, you'll need to unzip/decompress them before copying)._
10. Copy all the `.gpx` or `.tcx` files you wish to display and paste them into the **`data/raw/`** folder of this repository.

### Option B: Export an Individual Activity

1. Open the specific activity on Strava.
2. Click the actions menu (three dots icon `...`) on the left side of the activity view.
3. Select **Export GPX** or **Export TCX**.
4. Save the file and copy it to the **`data/raw/`** folder of this repository.

---

## 🛠️ Running the Parser

To process your raw TCX/GPX files and build the compiled web data structure:

1. Make sure you have **Node.js** installed on your machine.
2. Place your raw `.tcx` or `.gpx` files inside `data/raw/` (unsupported files are ignored here).
3. Open your terminal in this repository directory and execute:
   ```bash
   npm run parse
   ```
4. This will run `src/parser/parse.js`, parse the XML inputs, fetch and cache location names (via OpenStreetMap's reverse geocoding API), compile them chronologically, and save them as a single optimized `data/runs.json` database.

---

## 💻 Running the Website Locally

Since the frontend uses modern native ES6 modules (`import/export` statements), web browsers require a basic local server to fetch the modular files due to standard local security policies.

First, install the project development dependencies:

```bash
npm install
```

Then, launch the built-in, battle-tested `http-server` using:

```bash
npm start
```

This spins up the local static web server. Once running, open your web browser and navigate to:
👉 **[http://localhost:3030/](http://localhost:3030/)**

---

## 🧹 Code Linting & Formatting

To maintain modern, professional code quality and styling across both the parsing scripts and interactive client-side files, the project uses **ESLint** (Flat Config) and **Prettier**:

- **Lint check**: Inspect JavaScript files for errors, potential bugs, or standards conformance:
  ```bash
  npm run lint
  ```
- **Format code**: Auto-format all JavaScript, CSS, HTML, and Markdown files to consistent style rules:
  ```bash
  npm run format
  ```

---

## 🗺️ Displaying All Runs Globally & Relocating

This website is **completely location-agnostic**! It is designed to display all your runs globally out of the box, and dynamically **centers the map upon load onto a random location that has runs**.

If you prefer to lock your map and parsing pipeline down to one specific city, or if you relocate (e.g. to Athens), you can configure this in under 60 seconds in two places:

### 1. The Parser Filter (Targeted Location & Sports)

To constrain parsing to a single city, update the config at the top of **`src/parser/parse.js`**:

```javascript
const PARSER_CONFIG = {
  // Only parse activities of this sport type (case-insensitive). Set to null to disable.
  targetSport: 'Running',

  // Minimum distance in kilometers to include a run (filters out short "glitches" / accidental clicks)
  minDistanceKm: 0.1,

  // Enable/disable geographic filtering. Keeps runs close to your city center if defined.
  // Set cityCenter to null to allow runs from anywhere in the world!
  filterByLocation: true,

  // Center coordinate of your primary running city (Set to null to allow all locations)
  cityCenter: null,

  // Max radius in kilometers from the city center to include runs
  maxRadiusKm: 50,
};
```

### 2. The Frontend Defaults (Config)

Update the metadata at the top of **`src/web/config.js`**:

```javascript
export const CONFIG = {
  siteTitle: 'My Runs', // Website Header and Title

  // Default map view as fallback if no runs exist in data/runs.json yet
  defaultCenter: [37.9838, 23.7275],
  defaultZoom: 13,
};
```

Once updated, place your activities in `data/raw/` and execute `npm run parse`. The parser will compile them and the map will seamlessly display them!

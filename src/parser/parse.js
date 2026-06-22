const fs = require('fs');
const path = require('path');
const { parseTCX } = require('./tcx-parser');
const { parseGPX } = require('./gpx-parser');
const { haversineDistance } = require('./utils');

const RAW_DIR = path.join(__dirname, '..', '..', 'data', 'raw');
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'data', 'runs.json');
const CACHE_FILE = path.join(__dirname, '..', '..', 'data', '.geocoding_cache.json');

// Configuration for filtering runs
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (err) {
      console.warn('Warning: Failed to parse geocoding cache, starting fresh:', err.message);
    }
  }
  return [];
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save geocoding cache:', err.message);
  }
}

function findCachedLocation(lat, lon, cache, thresholdKm = 40) {
  return cache.find(entry => {
    const distanceMeters = haversineDistance(entry.lat, entry.lon, lat, lon);
    return distanceMeters / 1000 <= thresholdKm;
  });
}

async function getAddressName(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=en`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BerlinRunsApp/1.0',
        'Accept-Language': 'en',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const address = data.address || {};
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.suburb ||
      address.county ||
      address.state;
    const country = address.country;
    if (city && country) {
      return `${city}, ${country}`;
    } else if (country) {
      return country;
    } else if (data.display_name) {
      return data.display_name.split(',').slice(0, 2).join(',').trim();
    }
  } catch (err) {
    console.error(`Reverse geocoding failed for ${lat}, ${lon}:`, err.message);
  }
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

async function main() {
  console.log('=== Google Fit TCX Run Parser ===\n');

  // Ensure directories exist
  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
    console.log(`Created raw data directory: ${RAW_DIR}`);
  }

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Scan for files
  let files = [];
  try {
    files = fs.readdirSync(RAW_DIR);
  } catch (err) {
    console.error('Error reading raw directory:', err.message);
    process.exit(1);
  }

  const activityFiles = files.filter(f => {
    const ext = f.toLowerCase();
    return ext.endsWith('.tcx') || ext.endsWith('.gpx');
  });

  if (activityFiles.length === 0) {
    console.log('No TCX or GPX files found in data/raw/');
    console.log(
      'Please place your exported Google Fit .tcx or .gpx files in "data/raw/" and run this script again.'
    );

    // Create an empty array if output doesn't exist so frontend load doesn't crash
    if (!fs.existsSync(OUTPUT_FILE)) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify([], null, 2), 'utf8');
      console.log('Initialized empty data/runs.json');
    }
    return;
  }

  console.log(`Found ${activityFiles.length} activity files (TCX/GPX). Processing...`);

  const runs = [];
  let successCount = 0;
  let failCount = 0;
  let wrongSportCount = 0;
  let shortRunCount = 0;
  let outsideLocationCount = 0;

  for (const filename of activityFiles) {
    const filePath = path.join(RAW_DIR, filename);
    try {
      const xmlText = fs.readFileSync(filePath, 'utf8');

      const ext = path.extname(filename).toLowerCase();
      let run = null;
      if (ext === '.tcx') {
        run = parseTCX(xmlText);
      } else if (ext === '.gpx') {
        run = parseGPX(xmlText);
      }

      if (run) {
        // 1. Filter by Sport Type
        if (
          PARSER_CONFIG.targetSport &&
          run.sport.toLowerCase() !== PARSER_CONFIG.targetSport.toLowerCase()
        ) {
          console.log(`[Skipped] "${filename}" is a ${run.sport} activity (not Running)`);
          wrongSportCount++;
          continue;
        }

        // 2. Filter by Minimum Distance
        if (
          PARSER_CONFIG.minDistanceKm &&
          run.distanceMeters / 1000 < PARSER_CONFIG.minDistanceKm
        ) {
          console.log(
            `[Skipped] "${filename}" distance is ${(run.distanceMeters / 1000).toFixed(3)} km (below minimum ${PARSER_CONFIG.minDistanceKm} km)`
          );
          shortRunCount++;
          continue;
        }

        // 3. Filter by Location Center + Radius (only if cityCenter is configured)
        if (
          PARSER_CONFIG.filterByLocation &&
          PARSER_CONFIG.cityCenter &&
          run.coordinates &&
          run.coordinates.length > 0
        ) {
          const [startLat, startLon] = run.coordinates[0];
          const [centerLat, centerLon] = PARSER_CONFIG.cityCenter;

          const distanceMeters = haversineDistance(centerLat, centerLon, startLat, startLon);
          const distanceKm = distanceMeters / 1000;

          if (distanceKm > PARSER_CONFIG.maxRadiusKm) {
            console.log(
              `[Skipped] "${filename}" is outside ${PARSER_CONFIG.maxRadiusKm}km radius (${distanceKm.toFixed(1)}km away)`
            );
            outsideLocationCount++;
            continue;
          }
        }

        runs.push(run);
        successCount++;
      } else {
        console.warn(`[Warning] No GPS trackpoints or valid run data found in: ${filename}`);
        failCount++;
      }
    } catch (err) {
      console.error(`[Error] Failed to process ${filename}:`, err.message);
      failCount++;
    }
  }

  // Sort runs chronological: newest first
  runs.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Extract and cluster unique locations to enable unbiased page load map-centering
  const uniqueLocations = clusterLocations(runs);

  // Retrieve pretty names for each unique location with caching
  const cache = loadCache();
  let cacheUpdated = false;

  for (let i = 0; i < uniqueLocations.length; i++) {
    const loc = uniqueLocations[i];
    const cached = findCachedLocation(loc.lat, loc.lon, cache);
    if (cached) {
      console.log(
        `📍 Location ${i + 1}/${uniqueLocations.length}: Reusing cached name "${cached.name}" for ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`
      );
      loc.name = cached.name;
    } else {
      console.log(
        `📍 Location ${i + 1}/${uniqueLocations.length}: Geocoding ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)} online...`
      );
      loc.name = await getAddressName(loc.lat, loc.lon);
      console.log(`   Found name: "${loc.name}"`);
      cache.push({ lat: loc.lat, lon: loc.lon, name: loc.name });
      cacheUpdated = true;
      if (i < uniqueLocations.length - 1) {
        await sleep(1000); // Respect Nominatim's 1 req/sec policy
      }
    }
  }

  if (cacheUpdated) {
    saveCache(cache);
  }

  // Chunk the run coordinates into separate files to avoid large file issues and optimize loading
  const chunkFiles = [];
  const chunkSize = 20;
  const totalRuns = runs.length;

  for (let i = 0; i < totalRuns; i += chunkSize) {
    const chunkIndex = Math.floor(i / chunkSize) + 1;
    const chunkRuns = runs.slice(i, i + chunkSize);
    const chunkCoordinatesMap = {};

    chunkRuns.forEach(run => {
      // Extract start coordinate first before deleting
      run.startCoordinate = run.coordinates && run.coordinates.length > 0 ? run.coordinates[0] : null;

      // Map coordinates to run ID
      chunkCoordinatesMap[run.id] = run.coordinates || [];

      // Reference which chunk file this run's coordinates belong to
      run.chunkFile = `coords_part_${chunkIndex}.json`;

      // Delete the massive coordinates array from the index run object
      delete run.coordinates;
    });

    const chunkFileName = `coords_part_${chunkIndex}.json`;
    const chunkFilePath = path.join(outputDir, chunkFileName);

    try {
      fs.writeFileSync(chunkFilePath, JSON.stringify(chunkCoordinatesMap, null, 2), 'utf8');
      chunkFiles.push(chunkFileName);
      console.log(`Saved coordinate chunk file: ${chunkFileName}`);
    } catch (err) {
      console.error(`Failed to write coordinate chunk file ${chunkFileName}:`, err.message);
    }
  }

  // Write to runs.json (structured format)
  const outputData = {
    locations: uniqueLocations,
    chunks: chunkFiles,
    runs: runs,
  };

  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf8');
    console.log('\n=== Parsing complete! ===');
    console.log(`🟢 Successfully processed: ${successCount} runs`);
    console.log(`📍 Found unique run regions: ${uniqueLocations.length}`);
    console.log(`📦 Created ${chunkFiles.length} coordinate chunk files`);
    if (wrongSportCount > 0) {
      console.log(`🟡 Skipped (wrong sport):   ${wrongSportCount} activities`);
    }
    if (shortRunCount > 0) {
      console.log(`🟡 Skipped (too short):     ${shortRunCount} activities`);
    }
    if (outsideLocationCount > 0) {
      console.log(`🔴 Skipped (outside location bounds): ${outsideLocationCount} activities`);
    }
    if (failCount > 0) {
      console.log(`❌ Failed or invalid:     ${failCount} files`);
    }
    console.log(`Saved compiled data to: ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('Failed to write output runs.json:', err.message);
  }
}

/**
 * Cluster runs geographically to extract unique regions/cities
 * @param {Array} runs
 * @param {number} thresholdKm (Radius to group runs together, e.g. 40km)
 * @returns {Array<{lat: number, lon: number}>} Unique location centers
 */
function clusterLocations(runs, thresholdKm = 40) {
  const centers = [];

  runs.forEach(run => {
    if (!run.coordinates || run.coordinates.length === 0) return;
    const [lat, lon] = run.coordinates[0];

    // Check if close to an already discovered region center
    const isMatched = centers.some(center => {
      const distanceMeters = haversineDistance(center.lat, center.lon, lat, lon);
      return distanceMeters / 1000 <= thresholdKm;
    });

    if (!isMatched) {
      centers.push({ lat, lon });
    }
  });

  return centers;
}

if (require.main === module) {
  main();
}

const { haversineDistance, roundCoord } = require('./utils');

/**
 * Parses a GPX XML string and extracts activity metadata and the GPS route.
 * @param {string} xmlText
 * @returns {object|null} The parsed run, or null if invalid or has no trackpoints.
 */
function parseGPX(xmlText) {
  // 1. Extract activity type/sport
  // Strava GPX files typically store the activity type in <type> (e.g. 9 = Run, 1 = Ride/Biking)
  const typeMatch = xmlText.match(/<type>([^<]+)<\/type>/i);
  const rawType = typeMatch ? typeMatch[1].trim().toLowerCase() : '';

  let sport = 'Running'; // Default fallback
  if (rawType) {
    if (
      rawType === '9' ||
      rawType === 'run' ||
      rawType === 'running' ||
      rawType === 'running-activity'
    ) {
      sport = 'Running';
    } else if (
      rawType === '1' ||
      rawType === 'ride' ||
      rawType === 'biking' ||
      rawType === 'cycling'
    ) {
      sport = 'Biking';
    } else {
      // Capitalize first letter of rawType as fallback sport name
      sport = rawType.charAt(0).toUpperCase() + rawType.slice(1);
    }
  }

  // 2. Extract date/time from metadata or first trackpoint
  const metadataTimeMatch = xmlText.match(/<metadata>[^]*?<time>([^<]+)<\/time>[^]*?<\/metadata>/i);
  let dateStr = metadataTimeMatch ? metadataTimeMatch[1] : null;

  // 3. Scan and extract trackpoints
  // Handles varying quote types (single/double) and attribute ordering
  const trkptRegex =
    /<trkpt\s+lat=["']([-\d.]+)["']\s+lon=["']([-\d.]+)["'][^]*?>([\s\S]*?)<\/trkpt>/gi;
  let match;

  const coordinates = [];
  let calculatedDistance = 0;
  let prevLat = null;
  let prevLon = null;
  let firstTimeStr = null;
  let lastTimeStr = null;

  while ((match = trkptRegex.exec(xmlText)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const trkptContent = match[3];

    const roundedLat = roundCoord(lat);
    const roundedLon = roundCoord(lon);
    coordinates.push([roundedLat, roundedLon]);

    // Extract timestamp inside this trackpoint
    const timeMatch = trkptContent.match(/<time>([^<]+)<\/time>/i);
    if (timeMatch) {
      if (!firstTimeStr) firstTimeStr = timeMatch[1];
      lastTimeStr = timeMatch[1];
    }

    // Calculate cumulative distance since GPX has no pre-compiled summaries
    if (prevLat !== null && prevLon !== null) {
      calculatedDistance += haversineDistance(prevLat, prevLon, lat, lon);
    }
    prevLat = lat;
    prevLon = lon;
  }

  if (coordinates.length === 0) {
    return null;
  }

  // Fallbacks if metadata date was missing
  if (!dateStr) {
    dateStr = firstTimeStr || new Date().toISOString();
  }

  // Calculate duration in seconds
  let durationSeconds = 0;
  if (firstTimeStr && lastTimeStr) {
    durationSeconds = (new Date(lastTimeStr) - new Date(firstTimeStr)) / 1000;
  }

  // Calculate average pace (seconds per kilometer)
  const distanceKm = calculatedDistance / 1000;
  let paceSecondsPerKm = 0;
  if (distanceKm > 0 && durationSeconds > 0) {
    paceSecondsPerKm = durationSeconds / distanceKm;
  }

  return {
    id: dateStr, // Unique id
    date: dateStr,
    sport,
    distanceMeters: Math.round(calculatedDistance),
    durationSeconds: Math.round(durationSeconds),
    paceSecondsPerKm: Math.round(paceSecondsPerKm),
    coordinates, // Array of [lat, lon]
  };
}

module.exports = {
  parseGPX,
};

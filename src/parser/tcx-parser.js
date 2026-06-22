const { haversineDistance, roundCoord } = require('./utils');

/**
 * Parses a TCX XML string and extracts activity metadata and the GPS route.
 * @param {string} xmlText
 * @returns {object|null} The parsed run, or null if invalid or has no trackpoints.
 */
function parseTCX(xmlText) {
  // Simple, robust XML tag extractor using Regex
  // 1. Verify it's a running activity or at least has activities
  const activityMatch = xmlText.match(/<Activity\s+Sport="([^"]+)"/i);
  const sport = activityMatch ? activityMatch[1] : 'Running';

  // 2. Extract Id / Date
  const idMatch = xmlText.match(/<Id>([^<]+)<\/Id>/i);
  let dateStr = idMatch ? idMatch[1] : null;

  // 3. Extract all Lap stats (Time and Distance)
  let totalTimeSeconds = 0;
  let reportedDistanceMeters = 0;

  const lapRegex = /<Lap\s+StartTime="([^"]+)"[^]*?>([\s\S]*?)<\/Lap>/gi;
  let lapMatch;

  while ((lapMatch = lapRegex.exec(xmlText)) !== null) {
    const lapContent = lapMatch[2];
    if (!dateStr) {
      dateStr = lapMatch[1];
    }

    const timeMatch = lapContent.match(/<TotalTimeSeconds>([\d.]+)<\/TotalTimeSeconds>/i);
    const distMatch = lapContent.match(/<DistanceMeters>([\d.]+)<\/DistanceMeters>/i);

    if (timeMatch) totalTimeSeconds += parseFloat(timeMatch[1]);
    if (distMatch) reportedDistanceMeters += parseFloat(distMatch[1]);
  }

  // 4. Extract Trackpoints
  const trackpointRegex = /<Trackpoint>[^]*?<\/Trackpoint>/gi;
  const trackpoints = xmlText.match(trackpointRegex) || [];

  if (trackpoints.length === 0) {
    return null;
  }

  const coordinates = [];
  let calculatedDistance = 0;
  let prevLat = null;
  let prevLon = null;
  let firstTimeStr = null;
  let lastTimeStr = null;

  for (const tp of trackpoints) {
    // Extract Latitude and Longitude
    const latMatch = tp.match(/<LatitudeDegrees>([-\d.]+)<\/LatitudeDegrees>/i);
    const lonMatch = tp.match(/<LongitudeDegrees>([-\d.]+)<\/LongitudeDegrees>/i);
    const timeMatch = tp.match(/<Time>([^<]+)<\/Time>/i);

    if (latMatch && lonMatch) {
      const lat = parseFloat(latMatch[1]);
      const lon = parseFloat(lonMatch[1]);

      const roundedLat = roundCoord(lat);
      const roundedLon = roundCoord(lon);
      coordinates.push([roundedLat, roundedLon]);

      if (timeMatch) {
        if (!firstTimeStr) firstTimeStr = timeMatch[1];
        lastTimeStr = timeMatch[1];
      }

      // Calculate cumulative distance if reported distance is missing or 0
      if (prevLat !== null && prevLon !== null) {
        calculatedDistance += haversineDistance(prevLat, prevLon, lat, lon);
      }
      prevLat = lat;
      prevLon = lon;
    }
  }

  if (coordinates.length === 0) {
    return null;
  }

  // Fallbacks if stats were missing
  if (!dateStr) {
    dateStr = firstTimeStr || new Date().toISOString();
  }

  // If laps didn't report duration, calculate from trackpoint timestamps
  if (totalTimeSeconds === 0 && firstTimeStr && lastTimeStr) {
    totalTimeSeconds = (new Date(lastTimeStr) - new Date(firstTimeStr)) / 1000;
  }

  // Use reported distance if available and non-zero, otherwise fallback to calculated
  const finalDistanceMeters =
    reportedDistanceMeters > 0 ? reportedDistanceMeters : calculatedDistance;

  // Calculate average pace (seconds per kilometer)
  // Pace = Time (mins) / Distance (km)
  const distanceKm = finalDistanceMeters / 1000;
  let paceSecondsPerKm = 0;
  if (distanceKm > 0) {
    paceSecondsPerKm = totalTimeSeconds / distanceKm;
  }

  return {
    id: dateStr, // Unique id
    date: dateStr,
    sport,
    distanceMeters: Math.round(finalDistanceMeters),
    durationSeconds: Math.round(totalTimeSeconds),
    paceSecondsPerKm: Math.round(paceSecondsPerKm),
    coordinates, // Array of [lat, lon]
  };
}

module.exports = {
  parseTCX,
};

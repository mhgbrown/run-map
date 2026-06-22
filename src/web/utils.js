import { CONFIG } from './config.js';

/**
 * Format date into a human-readable string (e.g. "Monday, Jun 15, 2026")
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format distance based on metric configuration
 * @param {number} meters
 * @returns {string} Formatted distance (e.g. "5.24 km" or "3.26 mi")
 */
export function formatDistance(meters) {
  if (CONFIG.useMetric) {
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
  } else {
    const miles = meters * 0.000621371;
    return `${miles.toFixed(2)} mi`;
  }
}

/**
 * Format seconds into HH:MM:SS or MM:SS
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedMins = String(minutes).padStart(2, '0');
  const paddedSecs = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${paddedMins}:${paddedSecs}`;
  }
  return `${minutes}:${paddedSecs}`;
}

/**
 * Format pace (seconds per kilometer) based on metric configuration
 * @param {number} secondsPerKm
 * @returns {string} (e.g. "5:12 /km" or "8:22 /mi")
 */
export function formatPace(secondsPerKm) {
  if (CONFIG.useMetric) {
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = secondsPerKm % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')} /km`;
  } else {
    // Convert min/km to min/mile
    const secondsPerMile = Math.round(secondsPerKm * 1.60934);
    const minutes = Math.floor(secondsPerMile / 60);
    const seconds = secondsPerMile % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')} /mi`;
  }
}

/**
 * Decode a hex color string into RGB integer values
 * @param {string} hex (e.g., "#06b6d4")
 * @returns {{r: number, g: number, b: number}}
 */
function parseHex(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/**
 * Linearly interpolate between two hex colors
 * @param {string} color1 (e.g. "#06b6d4")
 * @param {string} color2 (e.g. "#3b82f6")
 * @param {number} factor (0.0 to 1.0)
 * @returns {string} Fully formatted css rgb string
 */
export function interpolateColor(color1, color2, factor) {
  const c1 = parseHex(color1);
  const c2 = parseHex(color2);
  const r = Math.round(c1.r + factor * (c2.r - c1.r));
  const g = Math.round(c1.g + factor * (c2.g - c1.g));
  const b = Math.round(c1.b + factor * (c2.b - c1.b));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Calculate the unique gradient color for a run based on its sorted rank
 * @param {number} rank (index in sorted distance list, from 0 to totalRuns - 1)
 * @param {number} totalRuns (total number of runs)
 * @returns {string} CSS rgb color representing the position in our spectrum
 */
export function getRunColor(rank, totalRuns) {
  const colors = CONFIG.routeColors;

  if (totalRuns <= 1) {
    return colors.medium;
  }

  // Calculate t (normalized rank ratio between 0 and 1)
  let t = rank / (totalRuns - 1);

  // Apply cosine ease-in-out to exaggerate/excite the color extremes
  t = (1 - Math.cos(t * Math.PI)) / 2;

  if (t < 0.5) {
    // Interpolate between short and medium
    return interpolateColor(colors.short, colors.medium, t * 2);
  } else {
    // Interpolate between medium and long
    return interpolateColor(colors.medium, colors.long, (t - 0.5) * 2);
  }
}

/**
 * Utility to calculate the distance between two GPS coordinates using the Haversine formula.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

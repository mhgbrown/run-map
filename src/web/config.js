export const CONFIG = {
  siteTitle: 'My Runs',

  // Default map settings on load (full world view)
  defaultCenter: [25, 0], // Centered above the equator
  defaultZoom: 3, // Continental zoom to frame the globe beautifully

  // Target zoom level when flying into a specific run's city/region
  targetZoom: 13,

  // Dynamic color spectrum based on run distance
  routeColors: {
    short: '#06b6d4', // Turquoise (Cyan-500)
    medium: '#3b82f6', // Royal Blue (Blue-500)
    long: '#ec4899', // Pink/Magenta (Pink-500)
  },

  // Visual styling for routes on the map
  routeStyles: {
    normal: {
      color: '#3b82f6', // Fallback color
      weight: 4,
      opacity: 0.75, // Slightly lower base opacity so overlapping runs are clearer
      lineCap: 'round',
      lineJoin: 'round',
    },
    hover: {
      weight: 6,
      opacity: 1.0,
    },
    active: {
      color: '#f43f5e', // Tailwind rose-500 (glowing crimson for selected route)
      weight: 7,
      opacity: 1.0,
    },
    background: {
      // Outline/shadow style for depth
      color: '#ffffff',
      weight: 8,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    },
  },

  // Tile layer URL and attribution (using CartoDB Voyager which looks extremely sleek)
  mapTiles: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },

  // Unit settings
  useMetric: true, // true for Kilometers, false for Miles
};

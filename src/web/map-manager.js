import { CONFIG } from './config.js';
import { getRunColor } from './utils.js';

export class MapManager {
  constructor(mapContainerId, callbacks = {}) {
    this.mapContainerId = mapContainerId;
    this.callbacks = callbacks; // { onRunSelected, onRunHovered }
    this.map = null;

    // Store polyline layers mapped by runId
    // Each run will have an object: { foreground: L.polyline, background: L.polyline, run: runData }
    this.routeLayers = {};
    this.activeRunId = null;
  }

  /**
   * Initialize the Leaflet map
   */
  init() {
    // Standard Leaflet initialization
    this.map = L.map(this.mapContainerId, {
      zoomControl: false, // We will position it at top-right or customize
    });

    // Add zoom control at a nice position
    L.control
      .zoom({
        position: 'topright',
      })
      .addTo(this.map);

    // Set fallback view initially
    this.map.setView(CONFIG.defaultCenter, CONFIG.defaultZoom);

    // Add CartoDB tile layer with aggressive caching and fast redraws (prevents pixelation!)
    L.tileLayer(CONFIG.mapTiles.url, {
      attribution: CONFIG.mapTiles.attribution,
      maxZoom: 19,
      updateInterval: 50, // Refresh tiles much faster during zoom/panning animations
      keepBuffer: 8, // Keep more loaded tiles in buffer to avoid gray/blurry flashes
    }).addTo(this.map);
  }

  /**
   * Render all runs on the map
   * @param {Array} runs
   */
  renderRoutes(runs) {
    // Clear any existing layers
    this.clearRoutes();

    if (!runs || runs.length === 0) {
      return;
    }

    const bounds = L.latLngBounds();

    // Sort runs by distance to calculate dynamic rank-based colors (high contrast!)
    const sortedRuns = [...runs].sort((a, b) => a.distanceMeters - b.distanceMeters);

    runs.forEach(run => {
      if (!run.coordinates || run.coordinates.length < 2) return;

      // Calculate dynamic rank-based gradient color
      const rank = sortedRuns.findIndex(r => r.id === run.id);
      const runColor = getRunColor(rank, sortedRuns.length);

      // Leaflet expects [lat, lon], our parser output is already [lat, lon]
      const latLngs = run.coordinates;

      // Create a background polyline for a clean outline effect
      const bgPolyline = L.polyline(latLngs, {
        ...CONFIG.routeStyles.background,
        interactive: false, // Let foreground handle all events
      }).addTo(this.map);

      // Create interactive foreground polyline
      const fgPolyline = L.polyline(latLngs, {
        ...CONFIG.routeStyles.normal,
        color: runColor,
        interactive: true,
      }).addTo(this.map);

      // Extend overall map bounds to include this track
      bounds.extend(fgPolyline.getBounds());

      // Bind a basic popup with run information
      const popupContent = `
        <div class="p-1">
          <div class="text-xs font-bold text-gray-400 uppercase tracking-wider">Run Details</div>
          <div class="text-sm font-bold text-gray-900 mt-0.5">${new Date(run.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
            <div><span class="text-gray-500">Distance:</span> <span class="font-semibold">${(run.distanceMeters / 1000).toFixed(2)} km</span></div>
            <div><span class="text-gray-500">Duration:</span> <span class="font-semibold">${Math.round(run.durationSeconds / 60)} min</span></div>
            <div><span class="text-gray-500">Avg Pace:</span> <span class="font-semibold">${this.formatPaceForPopup(run.paceSecondsPerKm)}</span></div>
          </div>
        </div>
      `;
      fgPolyline.bindPopup(popupContent, {
        closeButton: false,
        className: 'custom-map-popup',
      });

      // Save references
      this.routeLayers[run.id] = {
        foreground: fgPolyline,
        background: bgPolyline,
        run,
        normalColor: runColor,
      };

      // Set up event listeners for map-to-sidebar interaction
      fgPolyline.on('mouseover', () => {
        this.highlightRoute(run.id);
        if (this.callbacks.onRunHovered) {
          this.callbacks.onRunHovered(run.id);
        }
      });

      fgPolyline.on('mouseout', () => {
        this.resetRouteStyle(run.id);
        if (this.callbacks.onRunHovered) {
          this.callbacks.onRunHovered(null);
        }
      });

      fgPolyline.on('click', () => {
        fgPolyline.openPopup();
        this.focusRun(run.id, false); // Don't move popup, but update active state
        if (this.callbacks.onRunSelected) {
          this.callbacks.onRunSelected(run.id, false); // false = don't pan sidebar
        }
      });
    });
  }

  /**
   * Helper to format pace purely for Leaflet popups
   */
  formatPaceForPopup(secondsPerKm) {
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = secondsPerKm % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')} /km`;
  }

  /**
   * Focus, highlight and center map on a specific run
   * @param {string} runId
   * @param {boolean} zoomToTrack Whether to pan/zoom the map to this track
   */
  focusRun(runId, zoomToTrack = true) {
    // If there was an old active run, reset it
    if (this.activeRunId && this.activeRunId !== runId) {
      this.resetRouteStyle(this.activeRunId);
    }

    this.activeRunId = runId;
    const layer = this.routeLayers[runId];
    if (!layer) return;

    // Apply active styles
    layer.foreground.setStyle(CONFIG.routeStyles.active);
    layer.foreground.bringToFront();

    if (zoomToTrack) {
      this.map.fitBounds(layer.foreground.getBounds(), {
        padding: [60, 60],
        animate: true,
        duration: 0.8,
      });
      // Optionally open its popup
      layer.foreground.openPopup();
    }
  }

  /**
   * Reset the active selected state
   */
  clearActiveSelection() {
    if (this.activeRunId) {
      this.resetRouteStyle(this.activeRunId);
      this.activeRunId = null;
    }
  }

  /**
   * Highlight a route on hover
   * @param {string} runId
   */
  highlightRoute(runId) {
    const layer = this.routeLayers[runId];
    if (!layer || runId === this.activeRunId) return;

    layer.foreground.setStyle({
      ...CONFIG.routeStyles.hover,
      color: layer.normalColor,
    });
    layer.foreground.bringToFront();
  }

  /**
   * Reset a route to its appropriate state (normal or active)
   * @param {string} runId
   */
  resetRouteStyle(runId) {
    const layer = this.routeLayers[runId];
    if (!layer) return;

    if (runId === this.activeRunId) {
      layer.foreground.setStyle(CONFIG.routeStyles.active);
    } else {
      layer.foreground.setStyle({
        ...CONFIG.routeStyles.normal,
        color: layer.normalColor,
      });
    }
  }

  /**
   * Fit the map to bounds of all rendered runs
   */
  autoFitAllRuns() {
    const bounds = L.latLngBounds();
    Object.values(this.routeLayers).forEach(layer => {
      bounds.extend(layer.foreground.getBounds());
    });

    if (bounds.isValid()) {
      this.map.fitBounds(bounds, {
        padding: [40, 40],
      });
    }
  }

  /**
   * Remove all route polylines from the map
   */
  clearRoutes() {
    Object.values(this.routeLayers).forEach(layer => {
      this.map.removeLayer(layer.foreground);
      this.map.removeLayer(layer.background);
    });
    this.routeLayers = {};
    this.activeRunId = null;
  }

  /**
   * Safe wrapper to pan/center map view manually
   * @param {Array} center [lat, lon]
   * @param {number} zoom
   */
  setView(center, zoom) {
    if (this.map) {
      this.map.setView(center, zoom);
    }
  }

  /**
   * Cinematic panning and zooming flight animation to a coordinate
   * @param {Array} center [lat, lon]
   * @param {number} zoom
   */
  flyTo(center, zoom) {
    if (this.map) {
      this.map.flyTo(center, zoom, {
        animate: true,
        duration: 1.8, // A snappier 1.8-second smooth curve flight to reduce visual transitions
      });
    }
  }
}

import { CONFIG } from './config.js';
import { getRunColor } from './utils.js';

export class MapManager {
  constructor(mapContainerId, callbacks = {}) {
    this.mapContainerId = mapContainerId;
    this.callbacks = callbacks; // { onRunSelected, onRunHovered, onLoadChunksRequired }
    this.map = null;
    this.runs = [];

    // Store polyline layers mapped by runId
    // Each run will have an object: { foreground: L.polyline, background: L.polyline, run: runData }
    this.routeLayers = {};

    // Store circular start markers mapped by runId
    this.startPointLayers = {};

    this.activeRunId = null;
    this._isMovingProgrammatically = false;
  }

  /**
   * Store the full runs list
   * @param {Array} runs
   */
  setRuns(runs) {
    this.runs = runs;
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

    // Dynamic viewport / lazy chunk loading listener
    this.map.on('moveend', () => {
      this.handleMapMove();
    });
  }

  /**
   * Handle map zoom/panning dynamically to trigger lazy-loading of visible runs
   */
  async handleMapMove() {
    const zoom = this.map.getZoom();
    if (zoom >= 11) {
      await this.loadVisibleChunksAndRender();
    } else {
      this.renderStartPointsOnly();
    }
  }

  /**
   * Render lightweight start markers for all runs at low zoom levels
   */
  renderStartPointsOnly() {
    // Clear detailed routes
    this.clearRoutes();

    if (!this.runs || this.runs.length === 0) return;

    // Clear existing start points
    this.clearStartPoints();

    const sortedRuns = [...this.runs].sort((a, b) => a.distanceMeters - b.distanceMeters);

    this.runs.forEach(run => {
      const coord = run.startCoordinate || (run.coordinates && run.coordinates[0]);
      if (!coord) return;

      const rank = sortedRuns.findIndex(r => r.id === run.id);
      const runColor = getRunColor(rank, sortedRuns.length);

      const marker = L.circleMarker(coord, {
        radius: 6,
        fillColor: runColor,
        color: '#ffffff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.9,
        interactive: true,
      }).addTo(this.map);

      // Simple tooltip on hover
      marker.bindTooltip(
        `Run ${new Date(run.date).toLocaleDateString()}: ${(run.distanceMeters / 1000).toFixed(2)} km`,
        {
          direction: 'top',
          className: 'custom-tooltip',
        }
      );

      marker.on('click', () => {
        this.setView(coord, CONFIG.targetZoom || 13);
        if (this.callbacks.onRunSelected) {
          this.callbacks.onRunSelected(run.id, true);
        }
      });

      marker.on('mouseover', () => {
        if (this.callbacks.onRunHovered) {
          this.callbacks.onRunHovered(run.id);
        }
      });

      marker.on('mouseout', () => {
        if (this.callbacks.onRunHovered) {
          this.callbacks.onRunHovered(null);
        }
      });

      this.startPointLayers[run.id] = marker;
    });
  }

  /**
   * Identify runs in viewport, trigger fetching of their coordinate chunks, and render detailed routes
   */
  async loadVisibleChunksAndRender() {
    // Hide/clear start point circular markers when showing detailed tracks
    this.clearStartPoints();

    if (!this.runs || this.runs.length === 0) return;

    const bounds = this.map.getBounds();

    // Find runs whose start coordinates are inside the current map viewport
    const visibleRuns = this.runs.filter(run => {
      const coord = run.startCoordinate || (run.coordinates && run.coordinates[0]);
      if (!coord) return false;
      return bounds.contains(L.latLng(coord));
    });

    // Identify which chunks need loading
    const chunkFilesNeeded = [
      ...new Set(
        visibleRuns.filter(run => !run.coordinates && run.chunkFile).map(run => run.chunkFile)
      ),
    ];

    if (chunkFilesNeeded.length > 0 && this.callbacks.onLoadChunksRequired) {
      await this.callbacks.onLoadChunksRequired(chunkFilesNeeded);
    } else {
      this.renderRoutes(this.runs);
    }
  }

  /**
   * Render all runs on the map
   * @param {Array} runs
   */
  renderRoutes(runs) {
    const zoom = this.map.getZoom();
    if (zoom < 11) {
      this.renderStartPointsOnly();
      return;
    }

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
   * Remove all start point circular markers from the map
   */
  clearStartPoints() {
    Object.values(this.startPointLayers).forEach(layer => {
      this.map.removeLayer(layer);
    });
    this.startPointLayers = {};
  }

  /**
   * Fit the map to bounds of all rendered runs (handling low zoom gracefully)
   */
  autoFitAllRuns() {
    const bounds = L.latLngBounds();

    // If zoomed in, fit to routes; if zoomed out, fit to start coordinates
    const zoom = this.map.getZoom();
    if (zoom >= 11 && Object.keys(this.routeLayers).length > 0) {
      Object.values(this.routeLayers).forEach(layer => {
        bounds.extend(layer.foreground.getBounds());
      });
    } else {
      this.runs.forEach(run => {
        const coord = run.startCoordinate || (run.coordinates && run.coordinates[0]);
        if (coord) bounds.extend(L.latLng(coord));
      });
    }

    if (bounds.isValid()) {
      this.map.fitBounds(bounds, {
        padding: [40, 40],
      });
    }
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

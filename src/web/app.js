import { CONFIG } from './config.js';
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
  getRunColor,
  haversineDistance,
} from './utils.js';
import { MapManager } from './map-manager.js';

class RunningApp {
  constructor() {
    this.runs = [];
    this.locations = [];
    this.selectedLocationIndex = null;
    this.mapManager = null;
    this.activeRunId = null;

    // Lazy loading coordinate chunk state
    this.loadedChunks = new Set();
    this.loadingChunks = new Map(); // chunkFile -> Promise

    // UI Elements
    this.titleElement = document.getElementById('site-title');
    this.sidebarContainer = document.getElementById('runs-list');
    this.totalRunsElement = document.getElementById('stat-total-runs');
    this.totalDistanceElement = document.getElementById('stat-total-distance');
    this.totalDurationElement = document.getElementById('stat-total-duration');
    this.avgPaceElement = document.getElementById('stat-avg-pace');
    this.btnShowAll = document.getElementById('btn-show-all');
    this.emptyStateElement = document.getElementById('empty-state');
    this.statsPanelElement = document.getElementById('stats-panel');
    this.statsTitleElement = document.getElementById('stats-title');
  }

  /**
   * Start the application
   */
  async start() {
    this.initUI();
    this.initMap();
    await this.loadData();
  }

  /**
   * Apply dynamic metadata / styling to UI
   */
  initUI() {
    const titleElements = document.querySelectorAll('[id^="site-title"]');
    titleElements.forEach(el => {
      el.textContent = CONFIG.siteTitle;
    });
    document.title = CONFIG.siteTitle;

    if (this.btnShowAll) {
      this.btnShowAll.addEventListener('click', () => {
        const select = document.getElementById('location-select');
        if (select) {
          select.value = 'all';
        }
        this.selectedLocationIndex = null;
        this.clearSelection();
        this.renderStats();
        this.sidebarContainer.scrollTop = 0;
        this.renderSidebar();
        this.mapManager.autoFitAllRuns();
      });
    }

    this.btnRandomLocation = document.getElementById('btn-random-location');
    if (this.btnRandomLocation) {
      this.btnRandomLocation.addEventListener('click', () => {
        this.zoomToRandomLocation();
      });
    }

    const statsToggle = document.getElementById('stats-toggle');
    const statsGrid = document.getElementById('stats-grid');
    const statsChevron = document.getElementById('stats-chevron');
    if (statsToggle && statsGrid && statsChevron) {
      statsToggle.addEventListener('click', () => {
        const isCollapsed = statsGrid.classList.toggle('hidden');
        if (isCollapsed) {
          statsChevron.classList.add('rotate-180');
        } else {
          statsChevron.classList.remove('rotate-180');
        }
      });
    }
  }

  /**
   * Initialize Map Manager and bind synced callbacks
   */
  initMap() {
    this.mapManager = new MapManager('map', {
      onRunSelected: async (runId, panSidebar = true) => {
        await this.ensureCoordinatesLoadedForRun(runId);
        this.selectRun(runId, panSidebar);
      },
      onRunHovered: async runId => {
        if (runId) {
          await this.ensureCoordinatesLoadedForRun(runId);
        }
        this.hoverRun(runId);
      },
      onLoadChunksRequired: async chunkFiles => {
        return await this.loadChunks(chunkFiles);
      },
    });
    this.mapManager.init();
  }

  /**
   * Ensure coordinates are loaded for a specific run (e.g. on click or hover)
   */
  async ensureCoordinatesLoadedForRun(runId) {
    const run = this.runs.find(r => r.id === runId);
    if (run && !run.coordinates && run.chunkFile) {
      await this.loadChunks([run.chunkFile]);
    }
  }

  /**
   * Load specific coordinate chunk files dynamically on-demand
   * @param {Array<string>} chunkFiles List of chunk filenames to fetch
   * @returns {Promise<Object>} Map of runId -> coordinates loaded in this batch
   */
  async loadChunks(chunkFiles) {
    const chunksToFetch = chunkFiles.filter(file => !this.loadedChunks.has(file));
    if (chunksToFetch.length === 0) {
      // Check if any are currently loading and wait for them
      const outstandingPromises = chunkFiles
        .map(file => this.loadingChunks.get(file))
        .filter(Boolean);
      if (outstandingPromises.length > 0) {
        await Promise.all(outstandingPromises);
      }
      return {};
    }

    // Show map loading indicator
    const mapLoader = document.getElementById('map-loader');
    if (mapLoader) {
      mapLoader.classList.remove('hidden');
      mapLoader.style.opacity = '1';
    }

    const fetchPromises = chunksToFetch.map(chunkFile => {
      const promise = fetch(`./data/${chunkFile}`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`Failed to fetch coordinate chunk: ${chunkFile}`);
          }
          return res.json();
        })
        .then(chunkContent => {
          this.loadedChunks.add(chunkFile);
          this.loadingChunks.delete(chunkFile);

          // Merge loaded coordinates into in-memory runs list
          this.runs.forEach(run => {
            if (chunkContent[run.id]) {
              run.coordinates = chunkContent[run.id];
            }
          });
          return chunkContent;
        })
        .catch(err => {
          this.loadingChunks.delete(chunkFile);
          console.error(`Error loading chunk ${chunkFile}:`, err);
          return {};
        });

      this.loadingChunks.set(chunkFile, promise);
      return promise;
    });

    try {
      const chunkContents = await Promise.all(fetchPromises);

      // Re-render routes that have newly loaded coordinates
      if (this.mapManager) {
        this.mapManager.renderRoutes(this.runs);
      }

      // Return combined new coordinates for map layers to draw
      return Object.assign({}, ...chunkContents);
    } finally {
      // Hide map loading indicator if no more chunks are loading
      if (this.loadingChunks.size === 0 && mapLoader) {
        mapLoader.style.opacity = '0';
        setTimeout(() => {
          if (this.loadingChunks.size === 0) {
            mapLoader.classList.add('hidden');
          }
        }, 300);
      }
    }
  }

  /**
   * Fetch parsed runs from data directory
   */
  async loadData() {
    try {
      const response = await fetch('./data/runs.json');
      if (!response.ok) {
        throw new Error('Failed to fetch runs.json');
      }
      const data = await response.json();

      // Support both old flat JSON format (fallback) and new structured format
      this.runs = Array.isArray(data) ? data : data.runs || [];
      this.locations = Array.isArray(data) ? [] : data.locations || [];

      if (this.runs.length === 0) {
        this.showEmptyState();
        return;
      }

      this.hideEmptyState();
      this.populateLocationDropdown();

      // Handle deep linked location on page load
      const urlParams = new URLSearchParams(window.location.search);
      const queryLocationName = urlParams.get('location');
      let initialRunsToRender = this.runs;

      if (queryLocationName) {
        const matchedIndex = this.locations.findIndex(
          loc => loc.name && loc.name.toLowerCase() === queryLocationName.toLowerCase()
        );
        if (matchedIndex !== -1) {
          this.selectedLocationIndex = matchedIndex;
          const select = document.getElementById('location-select');
          if (select) {
            select.value = matchedIndex;
          }
          initialRunsToRender = this.getFilteredRuns();
        }
      }

      this.renderStats(initialRunsToRender);
      this.renderSidebar(initialRunsToRender);

      // Give runs to map-manager first
      this.mapManager.setRuns(this.runs);

      // Render the initial view
      this.mapManager.renderRoutes(this.runs);

      // If deep linked, center map on deep linked location center
      if (this.selectedLocationIndex !== null && this.selectedLocationIndex !== undefined) {
        const loc = this.locations[this.selectedLocationIndex];
        setTimeout(() => {
          this.mapManager.setView([loc.lat, loc.lon], CONFIG.targetZoom || 13);
        }, 100);
      }

      // Startup at stable full world view. Immediately fade out loader.
      setTimeout(() => {
        this.fadeLoader();
      }, 400);
    } catch (err) {
      console.error('Error loading run data:', err);
      this.fadeLoader();
      this.showEmptyState(true);
    }
  }

  /**
   * Populate the location dropdown select list and handle filtering
   */
  populateLocationDropdown() {
    const select = document.getElementById('location-select');
    if (!select) return;

    // Reset dropdown content
    select.innerHTML = '<option value="all">All Locations</option>';

    if (this.locations && this.locations.length > 0) {
      this.locations.forEach((loc, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = loc.name || `Location ${index + 1}`;
        select.appendChild(option);
      });
    }

    // Setup the change event listener
    select.addEventListener('change', e => {
      const val = e.target.value;
      const url = new URL(window.location);

      if (val === 'all') {
        this.selectedLocationIndex = null;
        this.clearSelection();
        this.renderStats();
        this.sidebarContainer.scrollTop = 0;
        this.renderSidebar();
        this.mapManager.autoFitAllRuns();

        // Update URL
        url.searchParams.delete('location');
        window.history.pushState({}, '', url);
      } else {
        const index = parseInt(val, 10);
        if (!isNaN(index) && this.locations[index]) {
          this.selectedLocationIndex = index;
          const loc = this.locations[index];
          this.clearSelection();

          // Filter runs by selected location and re-render stats/sidebar
          const filtered = this.getFilteredRuns();
          this.renderStats(filtered);
          this.sidebarContainer.scrollTop = 0;
          this.renderSidebar(filtered);

          // Pan and zoom Leaflet map to the selected center
          this.mapManager.setView([loc.lat, loc.lon], CONFIG.targetZoom || 13);

          // Update URL
          url.searchParams.set('location', loc.name);
          window.history.pushState({}, '', url);
        }
      }
    });
  }

  /**
   * Retrieve runs that fall within 40km of the currently selected location
   * @returns {Array} Filtered runs
   */
  getFilteredRuns() {
    if (this.selectedLocationIndex === null || this.selectedLocationIndex === undefined) {
      return this.runs;
    }
    const loc = this.locations[this.selectedLocationIndex];
    const thresholdKm = 40;
    return this.runs.filter(run => {
      const startCoord = run.startCoordinate || (run.coordinates && run.coordinates[0]);
      if (!startCoord) return false;
      const [lat, lon] = startCoord;
      const dist = haversineDistance(loc.lat, loc.lon, lat, lon);
      return dist / 1000 <= thresholdKm;
    });
  }

  /**
   * Instantly teleport map view to a randomly selected unique run region/location
   */
  zoomToRandomLocation() {
    const select = document.getElementById('location-select');
    if (select && this.locations && this.locations.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.locations.length);
      select.value = randomIndex;
      select.dispatchEvent(new Event('change'));
    } else {
      // Fallback if elements not available or empty
      if (!this.runs || this.runs.length === 0) return;

      // Filter by unique clustered locations list if available
      if (this.locations && this.locations.length > 0) {
        const randomIndex = Math.floor(Math.random() * this.locations.length);
        const randomLoc = this.locations[randomIndex];

        this.clearSelection(); // Clear any existing card selections for an unbiased view
        this.mapManager.setView([randomLoc.lat, randomLoc.lon], CONFIG.targetZoom || 13);
      } else if (this.runs.length > 0) {
        // Fallback if legacy flat JSON runs.json is used
        const randomIndex = Math.floor(Math.random() * this.runs.length);
        const randomRun = this.runs[randomIndex];
        if (randomRun.coordinates && randomRun.coordinates.length > 0) {
          this.clearSelection();
          this.mapManager.setView(randomRun.coordinates[0], CONFIG.targetZoom || 13);
        }
      }
    }
  }

  /**
   * Smoothly fade out and remove the full-screen loading screen overlay
   */
  fadeLoader() {
    const loader = document.getElementById('app-loader');
    if (loader) {
      loader.classList.add('opacity-0', 'pointer-events-none');
      // Cleanly remove from DOM after the 500ms CSS transition finishes
      setTimeout(() => loader.remove(), 500);
    }
  }

  /**
   * Calculate and show total overall stats
   */
  renderStats(runsToRender = this.getFilteredRuns()) {
    const totalRuns = runsToRender.length;
    let totalDistance = 0;
    let totalDuration = 0;
    let weightedPaceSum = 0;

    runsToRender.forEach(run => {
      totalDistance += run.distanceMeters;
      totalDuration += run.durationSeconds;
      weightedPaceSum += run.paceSecondsPerKm * run.distanceMeters;
    });

    const averagePaceSeconds = totalDistance > 0 ? Math.round(weightedPaceSum / totalDistance) : 0;

    if (this.totalRunsElement) this.totalRunsElement.textContent = totalRuns;
    if (this.totalDistanceElement)
      this.totalDistanceElement.textContent = formatDistance(totalDistance);
    if (this.totalDurationElement)
      this.totalDurationElement.textContent = formatDuration(totalDuration);
    if (this.avgPaceElement) this.avgPaceElement.textContent = formatPace(averagePaceSeconds);

    if (this.statsTitleElement) {
      if (this.selectedLocationIndex !== null && this.locations[this.selectedLocationIndex]) {
        const locName = this.locations[this.selectedLocationIndex].name;
        this.statsTitleElement.textContent = `Lifetime ${locName} Statistics`;
      } else {
        this.statsTitleElement.textContent = 'Lifetime Statistics';
      }
    }
  }

  /**
   * Render cards in the sidebar running history
   */
  renderSidebar(runsToRender = this.getFilteredRuns()) {
    if (!this.sidebarContainer) return;
    this.sidebarContainer.innerHTML = '';

    // Sort runs by distance to calculate dynamic rank-based colors (high contrast!)
    const sortedRuns = [...runsToRender].sort((a, b) => a.distanceMeters - b.distanceMeters);

    runsToRender.forEach(run => {
      const card = document.createElement('div');
      card.id = `run-card-${run.id}`;
      card.className = `run-card border border-gray-100 bg-white p-4 rounded-xl shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md hover:border-blue-100 relative overflow-hidden`;

      const rank = sortedRuns.findIndex(r => r.id === run.id);
      const runColor = getRunColor(rank, sortedRuns.length);

      // Dynamic color bar to accent hover/active states (matches map polyline color!)
      const accentBar = document.createElement('div');
      accentBar.className = 'accent-bar absolute left-0 top-0 bottom-0 transition-all duration-200';
      accentBar.style.backgroundColor = runColor;
      accentBar.style.width = '6px';
      accentBar.style.opacity = '0.4';
      card.appendChild(accentBar);

      // Card content
      const content = `
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">${run.sport || 'Running'}</span>
          <span class="text-xs text-gray-500">${formatDate(run.date).split(',')[1]}</span>
        </div>
        <h3 class="text-sm font-semibold text-gray-900 mt-1">${formatDate(run.date)}</h3>

        <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50 text-center">
          <div>
            <div class="text-xs text-gray-400 uppercase">Distance</div>
            <div class="text-sm font-bold text-gray-800 mt-0.5">${formatDistance(run.distanceMeters)}</div>
          </div>
          <div>
            <div class="text-xs text-gray-400 uppercase">Duration</div>
            <div class="text-sm font-bold text-gray-800 mt-0.5">${formatDuration(run.durationSeconds)}</div>
          </div>
          <div>
            <div class="text-xs text-gray-400 uppercase">Avg Pace</div>
            <div class="text-sm font-bold text-gray-800 mt-0.5">${formatPace(run.paceSecondsPerKm)}</div>
          </div>
        </div>
      `;

      const bodyWrapper = document.createElement('div');
      bodyWrapper.innerHTML = content;
      card.appendChild(bodyWrapper);

      // Wire sidebar-to-map interactions
      card.addEventListener('mouseenter', () => {
        this.mapManager.highlightRoute(run.id);
        if (this.activeRunId !== run.id) {
          accentBar.style.opacity = '1.0';
          accentBar.style.width = '10px';
        }
      });

      card.addEventListener('mouseleave', () => {
        this.mapManager.resetRouteStyle(run.id);
        if (this.activeRunId !== run.id) {
          accentBar.style.opacity = '0.4';
          accentBar.style.width = '6px';
        }
      });

      card.addEventListener('click', () => {
        this.selectRun(run.id, false); // select it in our state (don't scroll since user clicked it)
        this.mapManager.focusRun(run.id, true); // focus map on it
      });

      this.sidebarContainer.appendChild(card);
    });
  }

  /**
   * Selection event handler
   */
  selectRun(runId, scrollIntoView = true) {
    if (this.activeRunId === runId) return;

    // Remove active styles from previous card
    if (this.activeRunId) {
      const oldCard = document.getElementById(`run-card-${this.activeRunId}`);
      if (oldCard) {
        oldCard.classList.remove('active', 'ring-2', 'ring-blue-500', 'border-blue-200');
        const oldBar = oldCard.querySelector('.accent-bar');
        if (oldBar) {
          oldBar.style.opacity = '0.4';
          oldBar.style.width = '6px';
        }
      }
    }

    this.activeRunId = runId;

    // Apply active styles to new card
    const card = document.getElementById(`run-card-${runId}`);
    if (card) {
      card.classList.add('active', 'ring-2', 'ring-blue-500', 'border-blue-200');
      const bar = card.querySelector('.accent-bar');
      if (bar) {
        bar.style.opacity = '1.0';
        bar.style.width = '10px';
      }

      if (scrollIntoView) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  /**
   * Hover synchronization from map
   */
  hoverRun(runId) {
    // Only apply visual hover classes if it's not the active card
    this.runs.forEach(run => {
      if (run.id === this.activeRunId) return;

      const card = document.getElementById(`run-card-${run.id}`);
      if (!card) return;

      const bar = card.querySelector('.accent-bar');
      if (run.id === runId) {
        card.classList.add('border-blue-100', 'shadow-md');
        if (bar) {
          bar.style.opacity = '1.0';
          bar.style.width = '10px';
        }
      } else {
        card.classList.remove('border-blue-100', 'shadow-md');
        if (bar) {
          bar.style.opacity = '0.4';
          bar.style.width = '6px';
        }
      }
    });
  }

  /**
   * Reset selected run states
   */
  clearSelection() {
    if (this.activeRunId) {
      const card = document.getElementById(`run-card-${this.activeRunId}`);
      if (card) {
        card.classList.remove('active', 'ring-2', 'ring-blue-500', 'border-blue-200');
        const bar = card.querySelector('.accent-bar');
        if (bar) {
          bar.style.opacity = '0.4';
          bar.style.width = '6px';
        }
      }
      this.activeRunId = null;
      this.mapManager.clearActiveSelection();
    }
  }

  showEmptyState(hasError = false) {
    if (this.emptyStateElement) {
      this.emptyStateElement.classList.remove('hidden');
      if (hasError) {
        const title = this.emptyStateElement.querySelector('h3');
        const desc = this.emptyStateElement.querySelector('p');
        if (title) title.textContent = 'Error loading runs';
        if (desc)
          desc.textContent =
            'Please make sure runs.json exists and you have run the parsing script.';
      }
    }
    if (this.statsPanelElement) this.statsPanelElement.classList.add('opacity-40');
    if (this.sidebarContainer) this.sidebarContainer.classList.add('opacity-40');
  }

  hideEmptyState() {
    if (this.emptyStateElement) this.emptyStateElement.classList.add('hidden');
    if (this.statsPanelElement) this.statsPanelElement.classList.remove('opacity-40');
    if (this.sidebarContainer) this.sidebarContainer.classList.remove('opacity-40');
  }
}

// Instantiate and start app on load
window.addEventListener('DOMContentLoaded', () => {
  const app = new RunningApp();
  app.start();
});

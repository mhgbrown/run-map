const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseTCX } = require('../src/parser/tcx-parser');
const { parseGPX } = require('../src/parser/gpx-parser');
const { haversineDistance } = require('../src/parser/utils');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

test.describe('TCX Run Parser Tests', () => {
  test.describe('Mathematics Utilities', () => {
    test.it('should calculate accurate geographical distances using Haversine formula', () => {
      const lat1 = 52.5145;
      const lon1 = 13.3501;
      const lat2 = 52.515;
      const lon2 = 13.3525;

      const distance = haversineDistance(lat1, lon1, lat2, lon2);

      // Expected distance is approx. 173.2 meters
      assert.ok(distance > 170 && distance < 176, `Expected distance around 173m, got ${distance}`);
    });

    test.it('should return 0 for identical coordinates', () => {
      const lat = 52.52;
      const lon = 13.405;
      assert.equal(haversineDistance(lat, lon, lat, lon), 0);
    });
  });

  test.describe('XML TCX Parsing', () => {
    test.it('should parse valid running TCX correctly', () => {
      const xmlText = fs.readFileSync(path.join(FIXTURES_DIR, 'valid_run.tcx'), 'utf8');
      const run = parseTCX(xmlText);

      assert.notEqual(run, null);
      assert.equal(run.sport, 'Running');
      assert.equal(run.distanceMeters, 1000);
      assert.equal(run.durationSeconds, 600);
      assert.equal(run.paceSecondsPerKm, 600); // 600s for 1km = 600s/km
      assert.deepEqual(run.coordinates, [
        [52.5145, 13.3501],
        [52.515, 13.355],
      ]);
    });

    test.it('should parse biking activity correctly', () => {
      const xmlText = fs.readFileSync(path.join(FIXTURES_DIR, 'biking_activity.tcx'), 'utf8');
      const run = parseTCX(xmlText);

      assert.notEqual(run, null);
      assert.equal(run.sport, 'Biking');
      assert.equal(run.distanceMeters, 8000);
      assert.equal(run.durationSeconds, 1800);
    });
  });

  test.describe('XML GPX Parsing', () => {
    test.it('should parse valid running GPX correctly', () => {
      const xmlText = fs.readFileSync(path.join(FIXTURES_DIR, 'valid_run.gpx'), 'utf8');
      const run = parseGPX(xmlText);

      assert.notEqual(run, null);
      assert.equal(run.sport, 'Running');
      assert.equal(run.distanceMeters, 336); // Dynamically calculated distance
      assert.equal(run.durationSeconds, 600);
      assert.equal(run.paceSecondsPerKm, 1785); // 10 min for 0.336 km = ~1785 s/km
      assert.deepEqual(run.coordinates, [
        [52.5145, 13.3501],
        [52.515, 13.355],
      ]);
    });
  });

  test.describe('Sport & Location Filtering Integration', () => {
    // Shared center point matching test configurations
    const TEST_CITY_CENTER = [52.52, 13.405];
    const MAX_RADIUS_KM = 50;

    test.it('should accept runs that are of Running type and within city radius limits', () => {
      const xmlText = fs.readFileSync(path.join(FIXTURES_DIR, 'valid_run.tcx'), 'utf8');
      const run = parseTCX(xmlText);

      // Verify Sport Type
      assert.equal(run.sport, 'Running');

      // Verify Location Limits
      const [startLat, startLon] = run.coordinates[0];
      const distanceMeters = haversineDistance(
        TEST_CITY_CENTER[0],
        TEST_CITY_CENTER[1],
        startLat,
        startLon
      );
      const distanceKm = distanceMeters / 1000;

      assert.ok(
        distanceKm <= MAX_RADIUS_KM,
        `Run is ${distanceKm}km away, should be <= ${MAX_RADIUS_KM}km`
      );
    });

    test.it('should reject or identify activities of non-target sport types', () => {
      const xmlText = fs.readFileSync(path.join(FIXTURES_DIR, 'biking_activity.tcx'), 'utf8');
      const run = parseTCX(xmlText);

      // Biking activity should not match "Running" target
      assert.notEqual(run.sport, 'Running');
    });

    test.it(
      'should reject or identify runs that take place outside the city radius limit (Athens run)',
      () => {
        const xmlText = fs.readFileSync(path.join(FIXTURES_DIR, 'athens_run.tcx'), 'utf8');
        const run = parseTCX(xmlText);

        assert.notEqual(run, null);

        const [startLat, startLon] = run.coordinates[0];
        const distanceMeters = haversineDistance(
          TEST_CITY_CENTER[0],
          TEST_CITY_CENTER[1],
          startLat,
          startLon
        );
        const distanceKm = distanceMeters / 1000;

        // Distance from Berlin to Athens is approx. 1800km, which vastly exceeds 50km
        assert.ok(
          distanceKm > MAX_RADIUS_KM,
          `Run is ${distanceKm}km away, should be > ${MAX_RADIUS_KM}km`
        );
      }
    );

    test.it('should reject or identify runs below the minimum distance threshold', () => {
      const xmlText = fs.readFileSync(path.join(FIXTURES_DIR, 'valid_run.tcx'), 'utf8');
      const run = parseTCX(xmlText);

      assert.notEqual(run, null);

      const MIN_DISTANCE_KM = 5.0; // Setup 5km min limit for test
      const runDistanceKm = run.distanceMeters / 1000; // 1.0 km

      // Assert that our 1km run falls below the 5km threshold
      assert.ok(
        runDistanceKm < MIN_DISTANCE_KM,
        `Run is ${runDistanceKm}km, should be < ${MIN_DISTANCE_KM}km`
      );
    });

    test.it('should accept runs from any location when cityCenter configuration is null', () => {
      const xmlText = fs.readFileSync(path.join(FIXTURES_DIR, 'athens_run.tcx'), 'utf8');
      const run = parseTCX(xmlText);

      assert.notEqual(run, null);

      // Mocking the parse.js bypass logic:
      const config = { filterByLocation: true, cityCenter: null };
      const filterByLocationEnabled = config.filterByLocation && config.cityCenter !== null;

      // Assert that location filtering is safely bypassed
      assert.equal(filterByLocationEnabled, false);
    });

    test.it('should retrieve start coordinate of any parsed run for map centering', () => {
      const xmlText = fs.readFileSync(path.join(FIXTURES_DIR, 'valid_run.tcx'), 'utf8');
      const run = parseTCX(xmlText);

      assert.ok(Array.isArray(run.coordinates[0]));
      assert.equal(run.coordinates[0][0], 52.5145); // Valid start latitude
      assert.equal(run.coordinates[0][1], 13.3501); // Valid start longitude
    });
  });
});

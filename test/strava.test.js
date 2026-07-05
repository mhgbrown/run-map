const test = require('node:test');
const assert = require('node:assert/strict');
const StravaClient = require('../src/strava/client');
const { escapeXml, convertToGPX } = require('../src/strava/utils');

test.describe('Strava Integration Tests', () => {
  test.describe('escapeXml utility', () => {
    test.it('should escape XML entities properly', () => {
      assert.equal(escapeXml('Morning Run <Athens>'), 'Morning Run &' + 'lt;Athens&' + 'gt;');
      assert.equal(
        escapeXml('Paul\'s "Fast" & Slow Run'),
        'Paul&' + 'apos;s &' + 'quot;Fast&' + 'quot; &' + 'amp; Slow Run'
      );
      assert.equal(escapeXml(''), '');
      assert.equal(escapeXml(null), '');
    });
  });

  test.describe('convertToGPX utility', () => {
    test.it('should convert Strava activities & streams to well-formed GPX XML', () => {
      const mockActivity = {
        name: 'Afternoon <Run>',
        start_date: '2026-05-01T14:30:00Z',
        type: 'Run',
      };

      const mockStreams = {
        latlng: {
          data: [
            [52.5145, 13.3501],
            [52.515, 13.355],
          ],
        },
        time: {
          data: [0, 10],
        },
      };

      const gpx = convertToGPX(mockActivity, mockStreams);

      assert.ok(gpx.includes('<?xml version="1.0" encoding="UTF-8"?>'));
      assert.ok(gpx.includes('<type>Running</type>'));
      assert.ok(gpx.includes('<name>Afternoon &' + 'lt;Run&' + 'gt;</name>'));
      assert.ok(gpx.includes('<time>2026-05-01T14:30:00Z</time>'));
      assert.ok(gpx.includes('lat="52.5145" lon="13.3501"'));
      assert.ok(gpx.includes('<time>2026-05-01T14:30:10.000Z</time>'));
    });
  });

  test.describe('StravaClient API', () => {
    const originalFetch = globalThis.fetch;

    test.afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test.it('should initialize with valid config or throw', () => {
      assert.throws(() => new StravaClient({}));
      assert.throws(() => new StravaClient({ clientId: 123 }));

      const client = new StravaClient({
        clientId: 123,
        clientSecret: 'secret',
        refreshToken: 'refresh',
      });
      assert.equal(client.clientId, 123);
    });

    test.it('should refresh token on getAccessToken if expired or missing', async () => {
      const client = new StravaClient({
        clientId: 123,
        clientSecret: 'secret',
        refreshToken: 'refresh',
      });

      let fetchCalled = false;
      globalThis.fetch = async (url, options) => {
        if (url === 'https://www.strava.com/oauth/token') {
          fetchCalled = true;
          assert.equal(options.method, 'POST');
          const body = JSON.parse(options.body);
          assert.equal(body.client_id, 123);
          assert.equal(body.refresh_token, 'refresh');

          return {
            ok: true,
            json: async () => ({
              access_token: 'new_access_token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
          };
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      };

      const token = await client.getAccessToken();
      assert.equal(token, 'new_access_token');
      assert.equal(fetchCalled, true);

      // Verify caching (second call doesn't fetch)
      fetchCalled = false;
      const cachedToken = await client.getAccessToken();
      assert.equal(cachedToken, 'new_access_token');
      assert.equal(fetchCalled, false);
    });

    test.it('should fetch activities successfully', async () => {
      const client = new StravaClient({
        clientId: 123,
        clientSecret: 'secret',
        refreshToken: 'refresh',
      });
      client.accessToken = 'valid_token';
      client.expiresAt = Math.floor(Date.now() / 1000) + 1000;

      let fetchCalled = false;
      globalThis.fetch = async (url, options) => {
        if (url.startsWith('https://www.strava.com/api/v3/athlete/activities')) {
          fetchCalled = true;
          assert.equal(options.headers.Authorization, 'Bearer valid_token');
          return {
            ok: true,
            json: async () => [{ id: 111, name: 'Activity 1' }],
          };
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      };

      const list = await client.getActivities({ perPage: 10 });
      assert.deepEqual(list, [{ id: 111, name: 'Activity 1' }]);
      assert.equal(fetchCalled, true);
    });

    test.it('should fetch activity streams successfully', async () => {
      const client = new StravaClient({
        clientId: 123,
        clientSecret: 'secret',
        refreshToken: 'refresh',
      });
      client.accessToken = 'valid_token';
      client.expiresAt = Math.floor(Date.now() / 1000) + 1000;

      let fetchCalled = false;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/activities/999/streams')) {
          fetchCalled = true;
          assert.equal(options.headers.Authorization, 'Bearer valid_token');
          return {
            ok: true,
            json: async () => ({ latlng: { data: [[1, 2]] } }),
          };
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      };

      const streams = await client.getActivityStreams(999);
      assert.deepEqual(streams, { latlng: { data: [[1, 2]] } });
      assert.equal(fetchCalled, true);
    });
  });
});

/**
 * Reusable, lightweight, dependency-free client for interacting with the Strava API.
 */
class StravaClient {
  /**
   * @param {object} config
   * @param {string|number} config.clientId
   * @param {string} config.clientSecret
   * @param {string} config.refreshToken
   */
  constructor({ clientId, clientSecret, refreshToken }) {
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'StravaClient missing required configuration: clientId, clientSecret, and refreshToken are required.'
      );
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.accessToken = null;
    this.expiresAt = null;
  }

  /**
   * Refreshes the Strava OAuth2 access token if missing or expired.
   * @returns {Promise<string>} The valid access token.
   */
  async getAccessToken() {
    if (this.accessToken && this.expiresAt && Date.now() / 1000 < this.expiresAt - 60) {
      return this.accessToken;
    }

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Number(this.clientId),
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to refresh Strava token: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.expiresAt = data.expires_at; // unix timestamp in seconds
    return this.accessToken;
  }

  /**
   * Fetches a list of activities for the authenticated athlete.
   * @param {object} [options]
   * @param {number} [options.after] Epoch timestamp to filter activities after
   * @param {number} [options.before] Epoch timestamp to filter activities before
   * @param {number} [options.page=1] Page number to query
   * @param {number} [options.perPage=30] Page size
   * @returns {Promise<Array<object>>} Array of Strava activities
   */
  async getActivities({ after, before, page = 1, perPage = 30 } = {}) {
    const token = await this.getAccessToken();
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    if (after) params.append('after', after.toString());
    if (before) params.append('before', before.toString());

    const response = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch activities: ${response.status} - ${errText}`);
    }

    return response.json();
  }

  /**
   * Fetches latlng and time streams for a specific activity.
   * @param {string|number} activityId
   * @returns {Promise<object>} Object with key_by_type format containing latlng and time streams
   */
  async getActivityStreams(activityId) {
    if (!activityId) {
      throw new Error('activityId is required to fetch streams.');
    }
    const token = await this.getAccessToken();
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,time&key_by_type=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Failed to fetch activity streams for ${activityId}: ${response.status} - ${errText}`
      );
    }

    return response.json();
  }
}

module.exports = StravaClient;

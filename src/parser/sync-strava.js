const fs = require('fs');
const path = require('path');
const StravaClient = require('../strava/client');
const { convertToGPX } = require('../strava/utils');

// 1. Try to load local .env file if it exists for local development
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts
          .slice(1)
          .join('=')
          .trim()
          .replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    }
  });
}

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN;
const RAW_DIR = process.env.RAW_DIR || path.join(__dirname, '..', '..', 'data', 'raw');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('=== Strava Activity Sync ===\n');

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('Error: Missing required environment variables:');
    console.error('STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN are required.');
    console.error('Please configure them in your .env file or GitHub Secrets.\n');
    process.exit(1);
  }

  // Ensure raw data directory exists
  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
    console.log(`Created raw data directory: ${RAW_DIR}`);
  }

  // Scan existing strava activities in raw directory to prevent duplicate downloads
  let existingFiles = [];
  try {
    existingFiles = fs.readdirSync(RAW_DIR);
  } catch (err) {
    console.error('Error reading raw directory:', err.message);
    process.exit(1);
  }

  const existingActivityIds = new Set(
    existingFiles
      .filter(f => f.startsWith('strava_') && f.endsWith('.gpx'))
      .map(f => f.replace('strava_', '').replace('.gpx', ''))
  );

  console.log(`Found ${existingActivityIds.size} already synced Strava activities in data/raw/\n`);

  try {
    const client = new StravaClient({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
    });

    console.log('Fetching recent athlete activities...');
    // Fetch last 50 activities to check for any new ones
    const activities = await client.getActivities({ perPage: 50 });
    const runs = activities.filter(
      act => act.type === 'Run' || act.sport_type === 'Run' || act.type === 'Running'
    );

    console.log(
      `Found ${activities.length} recent activities. ${runs.length} are Running activities.`
    );

    let downloadCount = 0;
    for (const run of runs) {
      const activityId = run.id.toString();

      if (existingActivityIds.has(activityId)) {
        console.log(`[Skipped] Run "${run.name}" (ID: ${activityId}) already downloaded.`);
        continue;
      }

      console.log(`\n[Syncing] "${run.name}" (Date: ${run.start_date}, ID: ${activityId})...`);

      try {
        console.log(`-> Fetching GPS coordinate streams...`);
        const streams = await client.getActivityStreams(activityId);

        if (!streams.latlng || !streams.latlng.data || streams.latlng.data.length === 0) {
          console.warn(
            `-> [Warning] No GPS coordinates found for activity ${activityId}, skipping.`
          );
          continue;
        }

        console.log(`-> Generating GPX file...`);
        const gpxXml = convertToGPX(run, streams);

        const targetPath = path.join(RAW_DIR, `strava_${activityId}.gpx`);
        fs.writeFileSync(targetPath, gpxXml, 'utf8');
        console.log(`-> Saved to ${targetPath}`);
        downloadCount++;

        // Respect API rate limits
        await sleep(500);
      } catch (err) {
        console.error(`-> [Error] Failed to sync activity ${activityId}:`, err.message);
      }
    }

    console.log(`\n=== Sync complete! ===`);
    console.log(`🟢 Successfully downloaded: ${downloadCount} new Strava activities`);
  } catch (err) {
    console.error('\n❌ Sync failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

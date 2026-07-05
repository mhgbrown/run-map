const [, , clientId, clientSecret, authCode] = process.argv;

if (!clientId || !clientSecret || !authCode) {
  console.log('=== Strava Authorization Helper ===\n');
  console.log('To get your authorization code, open this URL in your browser:');
  console.log(
    'https://www.strava.com/oauth/authorize?client_id=<YOUR_CLIENT_ID>&redirect_uri=http://localhost&response_type=code&scope=activity:read_all\n'
  );
  console.log('After authorizing, copy the code from the localhost URL (e.g., code=xxxxxx).');
  console.log('Then, run this script with your credentials:');
  console.log(
    'node src/parser/strava-authorize.js <CLIENT_ID> <CLIENT_SECRET> <AUTHORIZATION_CODE>\n'
  );
  process.exit(0);
}

async function authorize() {
  console.log('Exchanging authorization code for refresh token...\n');
  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Number(clientId),
        client_secret: clientSecret,
        code: authCode,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to authorize: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    console.log('🟢 Success! Here is your permanent refresh token:');
    console.log(`\nSTRAVA_REFRESH_TOKEN="${data.refresh_token}"\n`);
    console.log('Update your .env file or GitHub Secrets with this value.');
  } catch (err) {
    console.error('❌ Authorization failed:', err.message);
  }
}

authorize();

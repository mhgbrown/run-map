/**
 * Safely escapes special characters in strings for valid XML inclusion.
 * @param {string} unsafe
 * @returns {string} XML-safe escaped string
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<':
        return '&' + 'lt;';
      case '>':
        return '&' + 'gt;';
      case '&':
        return '&' + 'amp;';
      case "'":
        return '&' + 'apos;';
      case '"':
        return '&' + 'quot;';
      default:
        return c;
    }
  });
}

/**
 * Converts a Strava activity and its associated stream data into a GPX format string.
 * @param {object} activity The Strava activity object
 * @param {object} streams The Strava stream object (containing latlng and time streams)
 * @returns {string} Well-formed GPX XML string
 */
function convertToGPX(activity, streams) {
  const latlngStream = streams.latlng ? streams.latlng.data : [];
  const timeStream = streams.time ? streams.time.data : [];
  const startTime = new Date(activity.start_date);

  let trkpts = '';
  for (let i = 0; i < latlngStream.length; i++) {
    const [lat, lon] = latlngStream[i];
    const offsetSeconds = timeStream[i] || 0;
    const ptTime = new Date(startTime.getTime() + offsetSeconds * 1000).toISOString();
    trkpts += `      <trkpt lat="${lat}" lon="${lon}">\n        <time>${ptTime}</time>\n      </trkpt>\n`;
  }

  // Ensure type is standard
  const sportType = activity.type === 'Run' ? 'Running' : activity.type;

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava GPX Generator" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <time>${activity.start_date}</time>
  </metadata>
  <trk>
    <name>${escapeXml(activity.name)}</name>
    <type>${sportType}</type>
    <trkseg>
${trkpts}    </trkseg>
  </trk>
</gpx>`;
}

module.exports = {
  escapeXml,
  convertToGPX,
};

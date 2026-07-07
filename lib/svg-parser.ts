// Parses the SVG returned by spotify-github-profile.kittinanx.com (theme=spotify-embed)
// and pulls out the fields we actually need: song, artist, status text, and the
// inline base64 album art.

export interface NowPlayingData {
  song: string;
  artist: string;
  statusText: string; // e.g. "Now playing" — cosmetic, comes straight from the widget
  imageBuffer: Buffer;
  imageMimeType: string; // e.g. "image/jpeg"
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractFirstGroup(svg: string, regex: RegExp): string | null {
  const match = svg.match(regex);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

export function parseNowPlayingSvg(svg: string): NowPlayingData {
  const song = extractFirstGroup(svg, /<div class="track-name">([^<]*)<\/div>/);
  const artist = extractFirstGroup(svg, /<div class="artist-name">([^<]*)<\/div>/);
  const statusText = extractFirstGroup(svg, /<span class="status-text">([^<]*)<\/span>/);

  const imageMatch = svg.match(
    /<img class="album-cover" src="data:(image\/[a-zA-Z]+);base64,([^"]+)"/
  );

  if (!song || !artist || !imageMatch) {
    throw new Error(
      "Failed to parse now-playing SVG — expected fields not found. " +
        "kittinan's markup may have changed."
    );
  }

  const imageMimeType = imageMatch[1];
  const base64Data = imageMatch[2];
  const imageBuffer = Buffer.from(base64Data, "base64");

  return {
    song,
    artist,
    statusText: statusText ?? "Now Playing",
    imageBuffer,
    imageMimeType,
  };
}

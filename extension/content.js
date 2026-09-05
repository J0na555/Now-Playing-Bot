// Watches the YouTube page and POSTs the current watch state to PUSH_URL:
//   { videoId, title, channel, paused }
//
// Failure is fine by design — the server treats stale state as inactive and the
// pinned message falls back to Spotify. So pushes are best-effort: failures only
// get a console.warn, never a crash.

// ------------------------------------------------------------------
// Selectors — YouTube's DOM drifts; treat these like the regexes in
// lib/svg-parser.ts and update them when the watcher stops reporting.
// ------------------------------------------------------------------
const SELECTORS = {
  // Channel link on the watch page (owner row / channel name).
  channelLink: "a#owner-name, ytd-channel-name a",
};

const WATCH_INTERVAL_MS = 2000;
const MIN_PUSH_INTERVAL_MS = 5000; // burst guard between pushes
const HEARTBEAT_INTERVAL_MS = 60000; // keeps server-side receivedAt fresh

let lastSnapshot = null;
let lastPushAt = 0;

function currentSnapshot() {
  const videoId = new URLSearchParams(location.search).get("v");
  if (!videoId) return null;

  const video = document.querySelector("video");
  const channelEl = document.querySelector(SELECTORS.channelLink);

  return {
    videoId,
    title: document.title.replace(/\s*-\s*YouTube\s*$/, "").trim(),
    channel: (channelEl?.textContent ?? "").trim(),
    paused: !!video && (video.paused || video.ended),
  };
}

function snapshotChanged(a, b) {
  return (
    a.videoId !== b.videoId ||
    a.title !== b.title ||
    a.channel !== b.channel ||
    a.paused !== b.paused
  );
}

function push(snapshot) {
  const now = Date.now();
  if (now - lastPushAt < MIN_PUSH_INTERVAL_MS) return;
  lastPushAt = now;

  fetch(PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PUSH_SECRET}`,
    },
    body: JSON.stringify(snapshot),
  }).catch((err) => {
    console.warn("Now Playing: push failed (ignored by design):", err);
  });
}

// Watch loop: push only when the snapshot actually changed.
setInterval(() => {
  const snapshot = currentSnapshot();
  if (!snapshot) return;
  if (!lastSnapshot || snapshotChanged(lastSnapshot, snapshot)) {
    lastSnapshot = snapshot;
    push(snapshot);
  }
}, WATCH_INTERVAL_MS);

// Heartbeat: re-POST the current snapshot so long videos keep refreshing the
// server-side receivedAt (the poll treats state as stale after ~180s).
setInterval(() => {
  const snapshot = currentSnapshot();
  if (snapshot) push(snapshot);
}, HEARTBEAT_INTERVAL_MS);
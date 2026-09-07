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
  const secret = getPushSecret();
  if (!secret) return; // not configured yet

  const now = Date.now();
  if (now - lastPushAt < MIN_PUSH_INTERVAL_MS) return;
  lastPushAt = now;

  fetch(getPushUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(snapshot),
  })
    .then((res) => {
      if (!res.ok) {
        // A rejected request means a config problem (secret mismatch, wrong
        // URL). Log the status so it is not a silent failure. No retry: the
        // watch loop re-pushes on the next change anyway.
        console.warn(
          `Now Playing: push rejected with ${res.status} (check Push URL and secret in the options page)`,
        );
      }
    })
    .catch((err) => {
      console.warn("Now Playing: push failed (ignored by design):", err);
    });
}

// Watch loop: push only when the snapshot actually changed.
function startLoop() {
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
}

// Load settings before starting the loop so pushes use the configured secret.
loadSettings().finally(startLoop);

// Re-load settings when the options page saves: without this, a YouTube tab
// that was open before saving keeps the old (possibly empty) secret forever.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.pushSecret || changes.pushUrl)) {
    loadSettings().catch(() => {});
  }
});

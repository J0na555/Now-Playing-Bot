// Settings are loaded from browser.storage.local via loadSettings().
// Defaults are used only until the user configures the options page.

const DEFAULTS = {
  pushUrl: "https://now-playing-bot.vercel.app/api/push",
  pushSecret: "",
};

let _pushUrl = DEFAULTS.pushUrl;
let _pushSecret = DEFAULTS.pushSecret;

async function loadSettings() {
  const stored = await browser.storage.local.get(["pushUrl", "pushSecret"]);
  _pushUrl = stored.pushUrl || DEFAULTS.pushUrl;
  _pushSecret = stored.pushSecret || DEFAULTS.pushSecret;
}

function getPushUrl() {
  return _pushUrl;
}

function getPushSecret() {
  return _pushSecret;
}


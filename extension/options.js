const DEFAULT_URL = "https://now-playing-bot.vercel.app/api/push";

const urlInput = document.getElementById("pushUrl");
const secretInput = document.getElementById("pushSecret");
const form = document.getElementById("optionsForm");
const statusEl = document.getElementById("status");

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.hidden = false;
  statusEl.classList.toggle("error", !!isError);
  setTimeout(() => {
    statusEl.hidden = true;
  }, 2500);
}

function setDisabled(disable) {
  form.querySelectorAll("input, button").forEach((el) => {
    el.disabled = disable;
  });
}

// Load current settings into the form.
setDisabled(true);
browser.storage.local
  .get(["pushUrl", "pushSecret"])
  .then((stored) => {
    urlInput.value = stored.pushUrl || DEFAULT_URL;
    secretInput.value = stored.pushSecret || "";
  })
  .finally(() => setDisabled(false));

// Persist on save.
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const pushUrl = urlInput.value.trim() || DEFAULT_URL;
  const pushSecret = secretInput.value.trim();

  if (!pushSecret) {
    showStatus("Secret is required.", true);
    return;
  }

  try {
    await browser.storage.local.set({ pushUrl, pushSecret });
    showStatus("Saved.");
  } catch (err) {
    console.error(err);
    showStatus("Save failed.", true);
  }
});

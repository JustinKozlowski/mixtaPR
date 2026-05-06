const serviceUrlInput = document.getElementById("serviceUrl");
const saveBtn = document.getElementById("saveBtn");
const authBtn = document.getElementById("authBtn");
const status = document.getElementById("status");

function setStatus(msg, type = "") {
  status.textContent = msg;
  status.className = "status" + (type ? " " + type : "");
}

// Load saved settings
chrome.storage.local.get(
  { serviceUrl: "http://localhost:5226" },
  ({ serviceUrl }) => {
    serviceUrlInput.value = serviceUrl;
  }
);

saveBtn.addEventListener("click", () => {
  const serviceUrl = serviceUrlInput.value.trim() || "http://localhost:5226";
  chrome.storage.local.set({ serviceUrl }, () => {
    setStatus("Settings saved!", "success");
    setTimeout(() => setStatus(""), 2000);
  });
});

authBtn.addEventListener("click", async () => {
  authBtn.disabled = true;
  setStatus("Opening Spotify authorization…");
  try {
    const resp = await chrome.runtime.sendMessage({ type: "SPOTIFY_AUTH" });
    if (resp.error) throw new Error(resp.error);
    setStatus("Authorized!", "success");
  } catch (e) {
    setStatus(e.message, "error");
  } finally {
    authBtn.disabled = false;
  }
});

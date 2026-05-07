const authBtn = document.getElementById("authBtn");
const status = document.getElementById("status");

function setStatus(msg, type = "") {
  status.textContent = msg;
  status.className = "status" + (type ? " " + type : "");
}

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

const statusEl = document.querySelector("#ai-status");
const detailEl = document.querySelector("#ai-detail");
const form = document.querySelector("#ai-form");
const resultStatus = document.querySelector("#ai-result-status");
const answer = document.querySelector("#ai-answer");
async function loadStatus() {
  try {
    const response = await fetch("/api/ai/status", { headers: { "Accept": "application/json" } });
    const result = await response.json();
    statusEl.textContent = result.enabled ? "Configured" : "Not configured";
    detailEl.textContent = result.message;
    if (!result.enabled) statusEl.style.color = "#ffb4aa";
  } catch {
    statusEl.textContent = "Unavailable";
    detailEl.textContent = "Could not check server configuration.";
  }
}
loadStatus();
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  resultStatus.className = "form-status";
  resultStatus.textContent = "Submitting question…";
  answer.hidden = true;
  try {
    const response = await fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ prompt: document.querySelector("#prompt").value.trim() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "The request failed.");
    answer.textContent = result.answer;
    answer.hidden = false;
    resultStatus.textContent = "Response received. Verify factual claims independently.";
    resultStatus.className = "form-status success";
  } catch (error) {
    resultStatus.textContent = error.message || "The AI service is unavailable.";
    resultStatus.className = "form-status error";
  } finally { button.disabled = false; }
});

const statusEl = document.querySelector("#ai-status");
const detailEl = document.querySelector("#ai-detail");
const form = document.querySelector("#ai-form");
const resultStatus = document.querySelector("#ai-result-status");
const answer = document.querySelector("#ai-answer");
const button = form.querySelector('button[type="submit"]');

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
let enginePromise = null;

function setStatus(status, detail) {
  statusEl.textContent = status;
  detailEl.textContent = detail;
}

function getEngine() {
  if (!("gpu" in navigator)) {
    throw new Error("This browser does not support WebGPU. Please use a recent version of Chrome or Edge on a supported device.");
  }
  if (!enginePromise) {
    enginePromise = import("https://esm.sh/@mlc-ai/web-llm@0.2.85?bundle").then(({ CreateMLCEngine }) =>
      CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (progress) => {
          const message = progress?.text || "Preparing the local model…";
          resultStatus.textContent = message;
          setStatus("Preparing local model", message);
        }
      })
    ).catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

if ("gpu" in navigator) {
  setStatus("Local AI available", "The model runs in your browser without an API key. The first use downloads several hundred megabytes; later uses can reuse the cached model.");
} else {
  setStatus("WebGPU required", "This browser or device does not support WebGPU, which is required for local AI inference.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const prompt = document.querySelector("#prompt").value.trim();
  if (prompt.length < 3) return;

  button.disabled = true;
  answer.hidden = true;
  resultStatus.className = "form-status";
  resultStatus.textContent = "Starting local AI…";

  try {
    const engine = await getEngine();
    setStatus("Local model ready", "Your question is processed in this browser; it is not sent to an AI API.");
    resultStatus.textContent = "Generating an answer locally…";
    const response = await engine.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are the research assistant for an independent civic-research initiative focused on public policy, institutions, Iran, and international relations. Be precise, distinguish established facts from analysis, acknowledge uncertainty, do not fabricate citations or claim to have browsed the web. If asked for current events, say that this local model has no live web access. Do not claim the initiative represents any government, party, or unconfirmed group. Answer in the same language as the user's question."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 900
    });
    const text = response?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("The local model returned an empty response.");
    answer.textContent = text;
    answer.hidden = false;
    resultStatus.textContent = "Answer generated locally. Verify factual claims independently; this model has no live web access.";
    resultStatus.className = "form-status success";
  } catch (error) {
    resultStatus.textContent = error?.message || "The local AI could not start. Check your connection and browser compatibility, then try again.";
    resultStatus.className = "form-status error";
  } finally {
    button.disabled = false;
  }
});

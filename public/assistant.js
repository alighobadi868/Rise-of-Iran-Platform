const statusEl = document.querySelector("#ai-status");
const detailEl = document.querySelector("#ai-detail");
const form = document.querySelector("#ai-form");
const resultStatus = document.querySelector("#ai-result-status");
const answer = document.querySelector("#ai-answer");
const button = form.querySelector('button[type="submit"]');

const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";
let generatorPromise = null;

function setStatus(status, detail) {
  statusEl.textContent = status;
  detailEl.textContent = detail;
}

async function getGenerator() {
  if (!generatorPromise) {
    generatorPromise = import("https://esm.sh/@huggingface/transformers@3.8.1?bundle")
      .then(({ pipeline }) => pipeline("text-generation", MODEL_ID, {
        dtype: "q4",
        progress_callback: (progress) => {
          const file = progress?.file || progress?.name || "";
          const percent = Number.isFinite(progress?.progress) ? ` ${Math.round(progress.progress)}%` : "";
          const message = `Downloading/preparing local model: ${file}${percent}`.trim();
          resultStatus.textContent = message;
          setStatus("Preparing local AI", message || "Downloading model files…");
        }
      }))
      .catch((error) => {
        generatorPromise = null;
        throw error;
      });
  }
  return generatorPromise;
}

setStatus(
  "Local AI ready to initialize",
  "No API key or GPU is required. First use downloads the quantized model to your browser; your question is processed locally and is not sent to an AI API."
);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const prompt = document.querySelector("#prompt").value.trim();
  if (prompt.length < 3) return;

  button.disabled = true;
  answer.hidden = true;
  resultStatus.className = "form-status";
  resultStatus.textContent = "Loading the local language model…";

  try {
    const generator = await getGenerator();
    setStatus("Local model loaded", "Your prompt is processed on this device. It is not sent to an AI API.");
    resultStatus.textContent = "Generating an answer on this device…";
    const output = await generator([
      {
        role: "system",
        content: "You are the research assistant for an independent civic-research initiative focused on public policy, institutions, Iran, and international relations. Be precise, distinguish established facts from analysis, acknowledge uncertainty, do not fabricate citations or claim to have browsed the web. If asked for current events, say that this local model has no live web access. Do not claim the initiative represents any government, party, or unconfirmed group. Answer in the same language as the user's question."
      },
      { role: "user", content: prompt }
    ], {
      max_new_tokens: 256,
      do_sample: false
    });
    const generated = output?.[0]?.generated_text;
    const text = Array.isArray(generated)
      ? generated.at(-1)?.content?.trim()
      : typeof generated === "string" ? generated.trim() : "";
    if (!text) throw new Error("The local model returned an empty response.");
    answer.textContent = text;
    answer.hidden = false;
    resultStatus.textContent = "Answer generated locally. Verify factual claims independently; this model has no live web access.";
    resultStatus.className = "form-status success";
  } catch (error) {
    resultStatus.textContent = error?.message || "The local AI could not start. Check your connection and available device memory, then try again.";
    resultStatus.className = "form-status error";
  } finally {
    button.disabled = false;
  }
});

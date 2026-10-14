const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector("#primary-nav");
if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  });
  nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    menuButton.setAttribute("aria-expanded", "false");
    nav.classList.remove("open");
  }));
}
const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());
const form = document.querySelector("#contact-form");
if (form) {
  const status = document.querySelector("#form-status");
  const submit = form.querySelector("button[type=submit]");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    status.textContent = "Sending your message…";
    status.className = "form-status";
    submit.disabled = true;
    const data = new FormData(form);
    const payload = Object.fromEntries(["name","email","subject","message"].map(key => [key, String(data.get(key) || "").trim()]));
    payload.consent = data.get("consent") === "on";
    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "The message could not be sent.");
      form.reset(); status.textContent = "Your inquiry has been received. Thank you."; status.className = "form-status success";
    } catch (error) {
      status.textContent = error instanceof TypeError ? "The server could not be reached. Please email new.persia.rise@gmail.com instead." : (error.message || "Something went wrong. Please try again.");
      status.className = "form-status error";
    } finally { submit.disabled = false; }
  });
}
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

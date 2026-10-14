import "dotenv/config";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import db from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: "20kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false });
const newsletterLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: "draft-7", legacyHeaders: false });

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(5000),
  consent: z.literal(true)
}).strict();

const emailSchema = z.object({ email: z.string().trim().email().max(254) }).strict();

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "rise-of-iran-platform", timestamp: new Date().toISOString() });
});

app.post("/api/contact", contactLimiter, (req, res, next) => {
  try {
    const input = contactSchema.parse(req.body);
    const result = db.prepare(`
      INSERT INTO contact_messages (name, email, subject, message, consent)
      VALUES (@name, @email, @subject, @message, 1)
    `).run(input);
    res.status(201).json({ ok: true, id: result.lastInsertRowid, message: "Your message has been received." });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, message: "Please check the form fields.", errors: error.issues.map(i => ({ field: i.path.join("."), message: i.message })) });
    next(error);
  }
});

app.post("/api/newsletter", newsletterLimiter, (req, res, next) => {
  try {
    const { email } = emailSchema.parse(req.body);
    db.prepare("INSERT INTO newsletter_subscribers (email) VALUES (?) ON CONFLICT(email) DO NOTHING").run(email);
    res.status(202).json({ ok: true, message: "Request received. Subscription confirmation is not yet enabled; no confirmation email has been sent." });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, message: "Enter a valid email address." });
    next(error);
  }
});

app.get("/api/ai/status", (_req, res) => {
  const enabled = process.env.AI_ENABLED === "true" && Boolean(process.env.AI_API_KEY) && Boolean(process.env.AI_MODEL);
  res.json({ enabled, message: enabled ? "AI provider configured." : "AI assistance is not configured yet." });
});

app.use(express.static("public", { extensions: ["html"], maxAge: isProduction ? "1h" : 0, etag: true }));
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, message: "API route not found." });
  res.status(404).sendFile("404.html", { root: "public" });
});
app.use((error, _req, res, _next) => {
  console.error("Request failed:", error?.message || "unknown error");
  res.status(500).json({ ok: false, message: "An unexpected server error occurred." });
});

app.listen(port, process.env.HOST || "0.0.0.0", () => {
  console.log(`Rise of Iran Platform listening on port ${port}`);
});

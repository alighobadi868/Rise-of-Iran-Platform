import "dotenv/config";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import db from "./db.js";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", "https://esm.run", "https://esm.sh", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://esm.sh", "https://huggingface.co", "https://*.huggingface.co", "https://*.hf.co", "https://raw.githubusercontent.com"],
      workerSrc: ["'self'", "blob:"],
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
  try {
    db.prepare("SELECT 1 AS ok").get();
    res.json({ status: "ok", service: "rise-of-iran-platform", checks: { database: "ok" }, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Health check failed:", error?.message || "database unavailable");
    res.status(503).json({ status: "degraded", service: "rise-of-iran-platform", checks: { database: "failed" }, timestamp: new Date().toISOString() });
  }
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

const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
const aiPromptSchema = z.object({ prompt: z.string().trim().min(3).max(4000) }).strict();

app.get("/api/ai/status", (_req, res) => {
  const enabled = process.env.AI_ENABLED === "true" && Boolean(process.env.AI_API_KEY) && Boolean(process.env.AI_MODEL);
  res.json({ enabled, message: enabled ? "AI provider configured." : "AI assistance is not configured yet." });
});

app.post("/api/ai/ask", aiLimiter, async (req, res) => {
  const enabled = process.env.AI_ENABLED === "true" && Boolean(process.env.AI_API_KEY) && Boolean(process.env.AI_MODEL);
  if (!enabled) return res.status(503).json({ ok: false, message: "The AI assistant is not configured. No prompt was sent to an AI provider." });
  let input;
  try { input = aiPromptSchema.parse(req.body); }
  catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, message: "Enter a prompt between 3 and 4,000 characters." });
    return res.status(400).json({ ok: false, message: "Invalid request." });
  }
  try {
    const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    const upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_MODEL,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          { role: "system", content: "You are the research assistant for an independent civic-research initiative. Be precise, distinguish facts from analysis, acknowledge uncertainty, avoid fabricated citations, and do not claim the initiative represents any government, party, or unconfirmed group." },
          { role: "user", content: input.prompt }
        ]
      }),
      signal: AbortSignal.timeout(25000)
    });
    if (!upstream.ok) {
      console.error("AI provider returned HTTP", upstream.status);
      return res.status(502).json({ ok: false, message: "The AI provider could not complete the request." });
    }
    const data = await upstream.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) return res.status(502).json({ ok: false, message: "The AI provider returned an empty response." });
    return res.json({ ok: true, answer: answer.trim() });
  } catch (error) {
    console.error("AI request failed:", error?.name || "unknown error");
    return res.status(502).json({ ok: false, message: "The AI service is temporarily unavailable." });
  }
});


const expertLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: "draft-7", legacyHeaders: false });
const inviteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false });
const expertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  degree: z.string().trim().min(2).max(100),
  field: z.string().trim().min(2).max(120),
  experience: z.string().trim().min(10).max(3000),
  videoUrl: z.string().trim().max(500).refine(v => { if (!v) return true; try { const u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } }, "Use a valid http(s) URL."),
  consent: z.literal(true)
}).strict();
const inviteSchema = z.object({
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(10).max(2000),
  consent: z.literal(true)
}).strict();
app.post("/api/experts", expertLimiter, (req, res, next) => {
  try {
    const input = expertSchema.parse(req.body);
    const result = db.prepare("INSERT INTO expert_applications (name,email,degree,field,experience,video_url,consent) VALUES (@name,@email,@degree,@field,@experience,@videoUrl,1)").run(input);
    res.status(201).json({ ok: true, id: result.lastInsertRowid, message: "درخواست همکاری شما در سامانه ثبت شد. این پیام تأیید عضویت یا پذیرش نهایی نیست." });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, message: "اطلاعات فرم را بررسی کنید و رضایت را تأیید کنید." });
    next(error);
  }
});
app.post("/api/invitations", inviteLimiter, (req, res, next) => {
  try {
    const input = inviteSchema.parse(req.body);
    const result = db.prepare("INSERT INTO collaboration_invitations (email,message,consent) VALUES (@email,@message,1)").run(input);
    res.status(201).json({ ok: true, id: result.lastInsertRowid, message: "پیشنهاد همکاری ثبت شد. دعوت‌نامهٔ خودکار ارسال نشده است." });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, message: "ایمیل و متن پیشنهاد را بررسی کنید و رضایت را تأیید کنید." });
    next(error);
  }
});
const charterQuestionSchema = z.object({ question: z.string().trim().min(3).max(2000) }).strict();
app.post("/api/charter/ask", (req, res) => {
  let question;
  try { question = charterQuestionSchema.parse(req.body).question; }
  catch { return res.status(400).json({ ok: false, message: "سؤال باید بین ۳ تا ۲۰۰۰ نویسه باشد." }); }
  const labor = /کارگر|پیمانکار|استخدام|بیمه|دستمزد|شغل|حقوق کاری|تأمین اجتماعی/i.test(question);
  const answer = labor
    ? "پاسخ اولیه: برای ارزیابی وضعیت کار، نوع قرارداد، نام کارفرمای ثبت‌شده، سابقه پرداخت بیمه، فیش‌های حقوقی و مقررات قابل اجرا باید جداگانه بررسی شوند. در صورت کار از طریق پیمانکار، درخواست سوابق بیمه و نسخه قرارداد و مراجعه به مرجع کار یا تأمین اجتماعی مربوطه می‌تواند نقطه شروع باشد.\n\nوضعیت منشور: متن کامل و نسخه مصوب منشور هنوز به پایگاه دانش متصل نشده است؛ بنابراین سامانه نمی‌تواند استخدام دائمی، مزایا یا بیمه‌ای را به‌عنوان تعهد قطعی منشور اعلام کند. این راهنمای عمومی، مشاوره حقوقی نیست."
    : "برای پاسخ مستند باید بند مرتبط و نسخهٔ منشور در پایگاه دانش ثبت شده باشد. در حال حاضر متن کامل منشور به سامانه متصل نیست و پاسخ قطعی به این سؤال تولید نمی‌شود. می‌توانی سؤال را با ذکر موضوع دقیق‌تر مطرح کنی؛ پاسخ‌های بعدی باید به بند مشخص و نسخهٔ سند ارجاع دهند.";
  res.json({ ok: true, answer, sourceStatus: "charter_document_not_configured" });
});
const careerSchema = z.object({ role: z.string().max(40), concern: z.string().max(40) }).strict();
app.post("/api/career/guide", (req, res) => {
  let input;
  try { input = careerSchema.parse(req.body); } catch { return res.status(400).json({ ok: false, message: "انتخاب‌های فرم معتبر نیستند." }); }
  const advice = {
    insurance: "۱) سابقه بیمه خود را از سامانه رسمی تأمین اجتماعی بررسی کن. ۲) قراردادها، فیش‌ها و رسیدهای پرداخت را نگه دار. ۳) اگر سابقه‌ای ثبت نشده، ابتدا از کارفرما کتبی پیگیری کن و سپس از مسیر رسمی تأمین اجتماعی/اداره کار راهنمایی بگیر.",
    security: "۱) مشخص کن طرف قرارداد مستقیم تو چه شخص یا شرکتی است. ۲) قراردادها و تمدیدها را نگه دار. ۳) از کارفرما درباره مدت قرارداد و معیارهای تمدید پاسخ کتبی بخواه. ۴) استخدام دائمی خودکار و تضمین‌شده نیست و به قانون، نوع رابطه کاری و سیاست مصوب بستگی دارد.",
    wages: "۱) قرارداد، فیش حقوقی و گردش پرداخت را نگه دار. ۲) مبلغ و موعد پرداخت را با قرارداد و مقررات جاری مقایسه کن. ۳) اختلاف را ابتدا کتبی مطرح کن و در صورت حل‌نشدن از مرجع رسمی کار راهنمایی بگیر.",
    training: "۱) مهارت‌های قابل سنجش شغل خود را فهرست کن. ۲) آموزش‌های معتبر مرتبط را انتخاب کن. ۳) تجربه و گواهی‌ها را مستند نگه دار و از کارفرما درباره مسیر ارتقا و معیارهای ارزیابی سؤال کتبی بپرس."
  };
  const roleNames = { municipal: "کارگر شهرداری/پیمانکاری", factory: "کارگر کارخانه", office: "کارمند اداری", teacher: "معلم", self: "خویش‌فرما" };
  res.json({ ok: true, answer: (roleNames[input.role] ? "حوزه شغلی: " + roleNames[input.role] + "\\n\\n" : "") + (advice[input.concern] || "قرارداد و مقررات مربوط به شغل خود را بررسی کن و برای تصمیم قطعی از مرجع رسمی مرتبط راهنمایی بگیر."), disclaimer: "این راهنمای عمومی است، نه مشاوره حقوقی. این توصیه‌ها به‌خودی‌خود سیاست مصوب منشور یا تضمین استخدام و مزایا نیستند." });
});


const videoDirectory = process.env.VIDEO_UPLOAD_DIR || "/tmp/rise-of-iran-videos";
fs.mkdirSync(videoDirectory, { recursive: true });
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, videoDirectory),
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + ({ "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" }[file.mimetype] || ".video"))
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 5, fieldSize: 2000 },
  fileFilter: (_req, file, cb) => ["video/mp4", "video/webm", "video/quicktime"].includes(file.mimetype) ? cb(null, true) : cb(new Error("فقط فایل MP4، WebM یا MOV پذیرفته می‌شود."))
});
const videoLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false });
app.get("/api/videos", (_req, res) => {
  const videos = db.prepare("SELECT id,title,category,description,filename,created_at FROM video_posts ORDER BY id DESC LIMIT 50").all()
    .map(v => ({ id:v.id,title:v.title,category:v.category,description:v.description,createdAt:v.created_at,url:"/media/videos/"+encodeURIComponent(v.filename) }));
  res.json({ ok:true,videos,storage:"prototype-temporary" });
});
app.post("/api/videos", videoLimiter, (req, res, next) => {
  videoUpload.single("video")(req, res, error => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ ok:false,message:"حجم ویدئو باید حداکثر ۵۰ مگابایت باشد." });
      return res.status(400).json({ ok:false,message:error.message || "فایل ویدئو معتبر نیست." });
    }
    try {
      const title=String(req.body.title||"").trim(), category=String(req.body.category||"دیدگاه").trim(), description=String(req.body.description||"").trim();
      if (!req.file) return res.status(400).json({ok:false,message:"یک فایل ویدئویی انتخاب کن."});
      if (title.length<2 || title.length>120 || description.length>1000 || category.length>60 || req.body.consent!=="on") {
        fs.unlink(req.file.path,()=>{});
        return res.status(400).json({ok:false,message:"عنوان، توضیح یا تأیید حق انتشار را بررسی کن."});
      }
      const result=db.prepare("INSERT INTO video_posts (title,category,description,filename,mimetype,filesize) VALUES (?,?,?,?,?,?)").run(title,category,description,req.file.filename,req.file.mimetype,req.file.size);
      return res.status(201).json({ok:true,id:result.lastInsertRowid,message:"ویدئو منتشر شد."});
    } catch (err) {
      if(req.file) fs.unlink(req.file.path,()=>{});
      next(err);
    }
  });
});
app.get("/media/videos/:filename", (req,res) => {
  const name=path.basename(req.params.filename);
  const video=db.prepare("SELECT filename,mimetype FROM video_posts WHERE filename=?").get(name);
  if(!video) return res.status(404).send("Video not found.");
  const filePath=path.join(videoDirectory,name);
  if(!fs.existsSync(filePath)) return res.status(410).send("Video storage is temporary and this file is no longer available.");
  res.setHeader("Content-Type",video.mimetype);
  res.setHeader("Accept-Ranges","bytes");
  res.sendFile(filePath);
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

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
import nodemailer from "nodemailer";
import { registerChannelRoutes } from "./channel-manager.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
// Render terminates TLS and forwards the client address through one trusted proxy hop.
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", "https://esm.run", "https://esm.sh", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://esm.sh", "https://cdn.jsdelivr.net", "https://huggingface.co", "https://*.huggingface.co", "https://*.hf.co", "https://raw.githubusercontent.com"],
      workerSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      mediaSrc: ["\'self\'", "https:"],
      frameSrc: ["\'self\'", "https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: "80kb", strict: true }));
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


const authLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });
const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(10).max(128)
}).strict();
const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(128)
}).strict();
const platformSessionCookie = "rise_session";
const sessionExpiryMs = 7 * 24 * 60 * 60 * 1000;
function getPlatformUser(req) {
  const raw = req.headers.cookie || "";
  const token = raw.split(";").map(value => value.trim()).find(value => value.startsWith(platformSessionCookie + "="))?.slice(platformSessionCookie.length + 1);
  if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = db.prepare("SELECT s.user_id,s.expires_at,u.name,u.email,u.verification_status FROM platform_sessions s JOIN platform_users u ON u.id=s.user_id WHERE s.token_hash=?").get(tokenHash);
  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) {
    db.prepare("DELETE FROM platform_sessions WHERE token_hash=?").run(tokenHash);
    return null;
  }
  return { id: Number(row.user_id), name: row.name, email: row.email, verificationStatus: row.verification_status };
}
function issuePlatformSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + sessionExpiryMs;
  db.prepare("INSERT INTO platform_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").run(crypto.createHash("sha256").update(token).digest("hex"), userId, expiresAt);
  res.setHeader("Set-Cookie", platformSessionCookie + "=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + Math.floor(sessionExpiryMs / 1000) + (isProduction ? "; Secure" : ""));
}
app.get("/api/auth/status", (req,res) => {
  const user = getPlatformUser(req);
  res.json({ ok:true, authenticated:Boolean(user), user:user ? { id:user.id,name:user.name,email:user.email,verificationStatus:user.verificationStatus } : null, emailVerificationConfigured:false });
});
app.post("/api/auth/register", authLimiter, (req,res) => {
  let input;
  try { input = registerSchema.parse(req.body); }
  catch { return res.status(400).json({ ok:false,message:"نام، ایمیل معتبر و گذرواژه‌ای با حداقل ۱۰ نویسه وارد کن." }); }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(input.password, salt, 64).toString("hex");
  try {
    const result = db.prepare("INSERT INTO platform_users (name,email,password_salt,password_hash) VALUES (?,?,?,?)").run(input.name,input.email,salt,hash);
    issuePlatformSession(res, Number(result.lastInsertRowid));
    res.status(201).json({ ok:true,message:"حساب کاربری ساخته شد. برای تأیید هویت، بخش درخواست بررسی را تکمیل کن.", user:{name:input.name,email:input.email,verificationStatus:"not_submitted"}, emailVerificationConfigured:false });
  } catch (error) {
    if (String(error?.code) === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ ok:false,message:"برای این ایمیل قبلاً حساب ساخته شده است؛ وارد شو." });
    console.error("Account registration failed:", error?.message || "unknown error");
    res.status(500).json({ ok:false,message:"ساخت حساب فعلاً انجام نشد." });
  }
});
app.post("/api/auth/login", authLimiter, (req,res) => {
  let input;
  try { input = loginSchema.parse(req.body); }
  catch { return res.status(400).json({ ok:false,message:"ایمیل و گذرواژه را بررسی کن." }); }
  const user = db.prepare("SELECT id,name,email,password_salt,password_hash,verification_status FROM platform_users WHERE email=?").get(input.email);
  const candidate = user ? crypto.scryptSync(input.password,user.password_salt,64) : crypto.scryptSync(input.password,"rise-platform-dummy-salt",64);
  const expected = user ? Buffer.from(user.password_hash,"hex") : Buffer.alloc(64);
  if (!user || candidate.length !== expected.length || !crypto.timingSafeEqual(candidate,expected)) return res.status(401).json({ ok:false,message:"ایمیل یا گذرواژه درست نیست." });
  issuePlatformSession(res,Number(user.id));
  res.json({ok:true,message:"وارد حساب شدی.",user:{name:user.name,email:user.email,verificationStatus:user.verification_status},emailVerificationConfigured:false});
});
app.post("/api/auth/logout", (req,res) => {
  const raw = req.headers.cookie || "";
  const token = raw.split(";").map(value => value.trim()).find(value => value.startsWith(platformSessionCookie + "="))?.slice(platformSessionCookie.length + 1);
  if (/^[a-f0-9]{64}$/.test(token || "")) db.prepare("DELETE FROM platform_sessions WHERE token_hash=?").run(crypto.createHash("sha256").update(token).digest("hex"));
  res.setHeader("Set-Cookie", platformSessionCookie + "=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" + (isProduction ? "; Secure" : ""));
  res.json({ok:true});
});

const mailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && (process.env.SMTP_FROM || process.env.SMTP_USER) && process.env.CONTACT_TO);
let mailTransport;
function getMailTransport() {
  if (!mailConfigured()) return null;
  if (!mailTransport) {
    const port = Number(process.env.SMTP_PORT || 587);
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }
  return mailTransport;
}
app.get("/api/email/status", (_req, res) => {
  res.json({ configured: mailConfigured(), purpose: "contact_notifications", message: mailConfigured() ? "Email transport is configured." : "Automatic email requires SMTP_HOST, SMTP_USER, SMTP_PASS and CONTACT_TO in the hosting environment." });
});
app.post("/api/contact", contactLimiter, async (req, res, next) => {
  try {
    const input = contactSchema.parse(req.body);
    const result = db.prepare(`
      INSERT INTO contact_messages (name, email, subject, message, consent)
      VALUES (@name, @email, @subject, @message, 1)
    `).run(input);
    if (!mailConfigured()) {
      return res.status(201).json({
        ok: true, id: result.lastInsertRowid, emailConfigured: false, emailSent: false,
        message: "پیام در سامانه ذخیره شد، اما ارسال خودکار ایمیل هنوز پیکربندی نشده است."
      });
    }
    try {
      await getMailTransport().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: process.env.CONTACT_TO,
        replyTo: input.email,
        subject: "[Rise of Iran] " + input.subject,
        text: "نام: " + input.name + "\\nایمیل پاسخ‌گو: " + input.email + "\\nموضوع: " + input.subject + "\\n\\n" + input.message
      });
      return res.status(201).json({ ok: true, id: result.lastInsertRowid, emailConfigured: true, emailSent: true, message: "پیام ثبت شد و از طریق ایمیل ارسال شد." });
    } catch (mailError) {
      console.error("Contact email delivery failed:", mailError?.code || mailError?.name || "unknown");
      return res.status(201).json({ ok: true, id: result.lastInsertRowid, emailConfigured: true, emailSent: false, message: "پیام در سامانه ذخیره شد، اما ارسال ایمیل انجام نشد. تنظیمات ایمیل سرور باید بررسی شود." });
    }
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, message: "اطلاعات فرم را بررسی کن.", errors: error.issues.map(i => ({ field: i.path.join("."), message: i.message })) });
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
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 5, fieldSize: 2000 },
  fileFilter: (_req, file, cb) => ["video/mp4", "video/webm", "video/quicktime"].includes(file.mimetype) ? cb(null, true) : cb(new Error("فقط فایل MP4، WebM یا MOV پذیرفته می‌شود."))
});
const videoLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false });
app.get("/api/videos", (_req, res) => {
  const videos = db.prepare("SELECT id,title,category,description,filename,created_at FROM video_posts ORDER BY id DESC LIMIT 50").all()
    .map(v => ({ id:v.id,title:v.title,category:v.category,description:v.description,createdAt:v.created_at,url:"/media/videos/"+encodeURIComponent(v.filename) }));
  res.json({ ok:true,videos,storage:"database" });
});
app.post("/api/videos", videoLimiter, (req, res, next) => {
  const user = getPlatformUser(req);
  if (!user) return res.status(401).json({ok:false,message:"برای انتشار ویدئو ابتدا وارد حساب کاربری شو."});
  
  videoUpload.single("video")(req, res, error => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ ok:false,message:"حجم ویدئو باید حداکثر ۵۰ مگابایت باشد." });
      return res.status(400).json({ ok:false,message:error.message || "فایل ویدئو معتبر نیست." });
    }
    try {
      const title=String(req.body.title||"").trim(), category=String(req.body.category||"دیدگاه").trim(), description=String(req.body.description||"").trim();
      if (!req.file) return res.status(400).json({ok:false,message:"یک فایل ویدئویی انتخاب کن."});
      if (title.length<2 || title.length>120 || description.length>1000 || category.length>60 || req.body.consent!=="on") {
        return res.status(400).json({ok:false,message:"عنوان، توضیح یا تأیید حق انتشار را بررسی کن."});
      }
      const filename=crypto.randomUUID()+({ "video/mp4":".mp4", "video/webm":".webm", "video/quicktime":".mov" }[req.file.mimetype]||".video");
      const result=db.prepare("INSERT INTO video_posts (title,category,description,filename,mimetype,filesize,data) VALUES (?,?,?,?,?,?,?)").run(title,category,description,filename,req.file.mimetype,req.file.size,req.file.buffer);
      return res.status(201).json({ok:true,id:result.lastInsertRowid,message:"ویدئو منتشر شد."});
    } catch (err) {
      next(err);
    }
  });
});
app.get("/media/videos/:filename", (req,res) => {
  const name=path.basename(req.params.filename);
  const video=db.prepare("SELECT filename,mimetype,filesize,data FROM video_posts WHERE filename=?").get(name);
  if(!video) return res.status(404).send("Video not found.");
  if(video.data) {
    res.setHeader("Content-Type",video.mimetype);
    res.setHeader("Content-Length",video.filesize);
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Accept-Ranges","bytes");
    res.setHeader("Cache-Control","public, max-age=86400");
    return res.send(video.data);
  }
  const filePath=path.join(videoDirectory,name);
  if(!fs.existsSync(filePath)) return res.status(410).send("This legacy video file is no longer available.");
  res.setHeader("Content-Type",video.mimetype);
  res.setHeader("Accept-Ranges","bytes");
  res.sendFile(filePath);
});


const cmsLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false });
const cmsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 5, fieldSize: 10000 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];
    cb(allowed.includes(file.mimetype) ? null : new Error("فقط JPG، PNG، WebP، GIF، MP4، WebM یا MOV پذیرفته می‌شود."), allowed.includes(file.mimetype));
  }
});
const cmsPassword = () => process.env.CMS_ADMIN_PASSWORD || "";
const cmsSecret = () => process.env.CMS_SESSION_SECRET || process.env.CMS_ADMIN_PASSWORD || "";
const cmsSignature = timestamp => crypto.createHmac("sha256", cmsSecret()).update(String(timestamp)).digest("hex");
function cmsAuthenticated(req) {
  if (!cmsPassword() || !cmsSecret()) return false;
  const raw = req.headers.cookie || "";
  const cookie = raw.split(";").map(v => v.trim()).find(v => v.startsWith("cms_session="))?.slice("cms_session=".length);
  if (!cookie) return false;
  const [ts, sig] = cookie.split(".");
  if (!/^\d{13}$/.test(ts || "") || !sig || Date.now() - Number(ts) > 8 * 60 * 60 * 1000 || Number(ts) > Date.now()) return false;
  const expected = cmsSignature(ts);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
const cmsAuth = (req, res, next) => cmsAuthenticated(req) ? next() : res.status(401).json({ ok: false, message: "برای ادامه وارد پنل مدیریت شو." });
registerChannelRoutes(app, { db, cmsAuth });

const identityRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  organization: z.string().trim().max(120).default(""),
  profileUrl: z.string().trim().max(500).refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return ["http:","https:"].includes(url.protocol); } catch { return false; }
  }, "نشانی پروفایل معتبر نیست."),
  reason: z.string().trim().min(20).max(2000),
  consent: z.literal(true)
}).strict();
app.get("/api/auth/verification", (req,res) => {
  const user = getPlatformUser(req);
  if (!user) return res.status(401).json({ok:false,message:"ابتدا وارد حساب کاربری شو."});
  const request = db.prepare("SELECT id,full_name,organization,profile_url,reason,status,admin_note,submitted_at,reviewed_at FROM identity_verification_requests WHERE user_id=? ORDER BY id DESC LIMIT 1").get(user.id);
  res.json({ok:true,request:request ? {id:Number(request.id),fullName:request.full_name,organization:request.organization,profileUrl:request.profile_url,reason:request.reason,status:request.status,adminNote:request.admin_note,submittedAt:request.submitted_at,reviewedAt:request.reviewed_at} : null});
});
app.post("/api/auth/verification", authLimiter, (req,res) => {
  const user = getPlatformUser(req);
  if (!user) return res.status(401).json({ok:false,message:"ابتدا وارد حساب کاربری شو."});
  if (user.verificationStatus === "verified") return res.status(409).json({ok:false,message:"حساب تو قبلاً توسط مدیر تأیید شده است."});
  if (user.verificationStatus === "pending") return res.status(409).json({ok:false,message:"درخواستت در صف بررسی است؛ منتظر نتیجه بمان."});
  let input;
  try { input = identityRequestSchema.parse(req.body); }
  catch { return res.status(400).json({ok:false,message:"نام کامل، توضیح کافی و رضایت لازم است؛ پیوند پروفایل باید معتبر باشد."}); }
  const result = db.prepare("INSERT INTO identity_verification_requests (user_id,full_name,organization,profile_url,reason) VALUES (?,?,?,?,?)").run(user.id,input.fullName,input.organization,input.profileUrl,input.reason);
  db.prepare("UPDATE platform_users SET verification_status='pending' WHERE id=?").run(user.id);
  res.status(201).json({ok:true,id:Number(result.lastInsertRowid),message:"درخواست بررسی ثبت شد؛ تا زمان بررسی مدیر، حساب تأییدشده محسوب نمی‌شود."});
});
app.get("/api/cms/verification-requests", cmsAuth, (_req,res) => {
  const requests = db.prepare(`SELECT r.id,r.user_id,r.full_name,r.organization,r.profile_url,r.reason,r.status,r.admin_note,r.submitted_at,r.reviewed_at,u.email,u.name AS account_name
    FROM identity_verification_requests r JOIN platform_users u ON u.id=r.user_id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.id DESC LIMIT 200`).all()
    .map(r=>({id:Number(r.id),userId:Number(r.user_id),fullName:r.full_name,organization:r.organization,profileUrl:r.profile_url,reason:r.reason,status:r.status,adminNote:r.admin_note,submittedAt:r.submitted_at,reviewedAt:r.reviewed_at,email:r.email,accountName:r.account_name}));
  res.json({ok:true,requests});
});
app.patch("/api/cms/verification-requests/:id", cmsAuth, (req,res) => {
  const id=Number(req.params.id);
  const status=req.body?.status;
  const note=typeof req.body?.adminNote==="string"?req.body.adminNote.trim():"";
  if(!Number.isSafeInteger(id)||id<1||!["approved","rejected"].includes(status)||note.length>500) return res.status(400).json({ok:false,message:"وضعیت یا یادداشت بررسی معتبر نیست."});
  const request=db.prepare("SELECT user_id FROM identity_verification_requests WHERE id=?").get(id);
  if(!request) return res.status(404).json({ok:false,message:"درخواست پیدا نشد."});
  const update=db.transaction(()=>{
    db.prepare("UPDATE identity_verification_requests SET status=?,admin_note=?,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(status,note,id);
    db.prepare("UPDATE platform_users SET verification_status=? WHERE id=?").run(status==="approved"?"verified":"rejected",request.user_id);
  });
  update();
  res.json({ok:true,message:status==="approved"?"حساب تأیید شد.":"درخواست رد شد."});
});

app.get("/api/cms/status", (_req, res) => res.json({ enabled: Boolean(cmsPassword() && cmsSecret()) }));
app.post("/api/cms/login", cmsLoginLimiter, (req, res) => {
  if (!cmsPassword() || !cmsSecret()) return res.status(503).json({ ok: false, message: "پنل مدیریت هنوز پیکربندی نشده است." });
  const supplied = typeof req.body?.password === "string" ? req.body.password : "";
  const a = crypto.createHash("sha256").update(supplied).digest();
  const b = crypto.createHash("sha256").update(cmsPassword()).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ ok: false, message: "رمز عبور درست نیست." });
  const ts = String(Date.now());
  res.setHeader("Set-Cookie", `cms_session=${ts}.${cmsSignature(ts)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${isProduction ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.post("/api/cms/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `cms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isProduction ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.get("/api/cms/inbox", cmsAuth, (_req,res) => {
  const messages=db.prepare("SELECT id,name,email,subject,message,created_at FROM contact_messages ORDER BY id DESC LIMIT 200").all()
    .map(x=>({id:Number(x.id),name:x.name,email:x.email,subject:x.subject,message:x.message,createdAt:x.created_at}));
  const experts=db.prepare("SELECT id,name,email,degree,field,experience,video_url,created_at FROM expert_applications ORDER BY id DESC LIMIT 100").all()
    .map(x=>({id:Number(x.id),name:x.name,email:x.email,degree:x.degree,field:x.field,experience:x.experience,videoUrl:x.video_url,createdAt:x.created_at}));
  const invitations=db.prepare("SELECT id,email,message,created_at FROM collaboration_invitations ORDER BY id DESC LIMIT 100").all()
    .map(x=>({id:Number(x.id),email:x.email,message:x.message,createdAt:x.created_at}));
  const subscribers=db.prepare("SELECT id,email,confirmed,created_at FROM newsletter_subscribers ORDER BY id DESC LIMIT 200").all()
    .map(x=>({id:Number(x.id),email:x.email,confirmed:Boolean(x.confirmed),createdAt:x.created_at}));
  res.json({ok:true,messages,experts,invitations,subscribers});
});
app.get("/api/cms/members", cmsAuth, (_req,res) => {
 const users=db.prepare("SELECT id,name,email,created_at FROM platform_users ORDER BY id DESC LIMIT 500").all()
  .map(x=>({id:Number(x.id),name:x.name,email:x.email,createdAt:x.created_at}));
 res.json({ok:true,members:users});
});
app.get("/api/cms/posts", cmsAuth, (_req, res) => {
  const posts = db.prepare(`SELECT p.id,p.title,p.body,p.published,p.created_at,p.updated_at,m.id AS media_id,m.mimetype,m.filename
    FROM cms_posts p LEFT JOIN cms_media m ON m.id=p.media_id ORDER BY p.id DESC LIMIT 100`).all()
    .map(p => ({ id:p.id,title:p.title,body:p.body,published:Boolean(p.published),createdAt:p.created_at,updatedAt:p.updated_at,media:p.media_id?{url:"/api/cms/media/"+p.media_id,mimetype:p.mimetype,filename:p.filename}:null }));
  res.json({ ok:true,posts });
});
app.post("/api/cms/posts", cmsAuth, (req, res, next) => {
  cmsUpload.single("media")(req, res, error => {
    if (error) return res.status(error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ok:false,message:error.message || "فایل پذیرفته نشد."});
    try {
      const title=String(req.body.title||"").trim(), body=String(req.body.body||"").trim();
      if (title.length<2 || title.length>160 || body.length>12000) return res.status(400).json({ok:false,message:"عنوان باید ۲ تا ۱۶۰ نویسه و متن حداکثر ۱۲هزار نویسه باشد."});
      if (!body && !req.file) return res.status(400).json({ok:false,message:"متن یا فایل رسانه‌ای اضافه کن."});
      let mediaId=null;
      if(req.file) {
        const result=db.prepare("INSERT INTO cms_media (filename,mimetype,data,filesize) VALUES (?,?,?,?)").run(path.basename(req.file.originalname).slice(0,180) || "media",req.file.mimetype,req.file.buffer,req.file.size);
        mediaId=Number(result.lastInsertRowid);
      }
      const result=db.prepare("INSERT INTO cms_posts (title,body,media_id,published) VALUES (?,?,?,?)").run(title,body,mediaId,req.body.published==="on"?1:0);
      res.status(201).json({ok:true,id:Number(result.lastInsertRowid),message:"مطلب ذخیره شد."});
    } catch(err) { next(err); }
  });
});
app.patch("/api/cms/posts/:id", cmsAuth, (req,res,next) => {
  try {
    const id=Number(req.params.id), title=String(req.body?.title||"").trim(), body=String(req.body?.body||"").trim();
    if(!Number.isSafeInteger(id)||id<1||title.length<2||title.length>160||body.length>12000||typeof req.body?.published!=="boolean") return res.status(400).json({ok:false,message:"اطلاعات ویرایش معتبر نیست."});
    const result=db.prepare("UPDATE cms_posts SET title=?,body=?,published=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(title,body,req.body.published?1:0,id);
    if(!result.changes) return res.status(404).json({ok:false,message:"مطلب پیدا نشد."});
    res.json({ok:true,message:"تغییرات ذخیره شد."});
  } catch(err){next(err);}
});
app.delete("/api/cms/posts/:id", cmsAuth, (req,res,next) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({ok:false,message:"شناسه معتبر نیست."});
    const row=db.prepare("SELECT media_id FROM cms_posts WHERE id=?").get(id);
    if(!row) return res.status(404).json({ok:false,message:"مطلب پیدا نشد."});
    db.prepare("DELETE FROM cms_posts WHERE id=?").run(id);
    if(row.media_id && !db.prepare("SELECT 1 FROM cms_posts WHERE media_id=?").get(row.media_id)) db.prepare("DELETE FROM cms_media WHERE id=?").run(row.media_id);
    res.json({ok:true,message:"مطلب حذف شد."});
  } catch(err){next(err);}
});
app.get("/api/cms/media/:id", (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(404).end();
  const media=db.prepare(`SELECT m.mimetype,m.data,m.filesize,
    EXISTS (SELECT 1 FROM cms_posts p WHERE p.media_id=m.id AND p.published=1) AS is_public,
    EXISTS (SELECT 1 FROM cms_posts p WHERE p.media_id=m.id) AS is_attached
    FROM cms_media m WHERE m.id=?`).get(id);
  if(!media || !media.is_attached || (!media.is_public && !cmsAuthenticated(req))) return res.status(404).end();
  res.setHeader("Content-Type",media.mimetype);
  res.setHeader("Content-Length",media.filesize);
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Cache-Control",media.is_public ? "public, max-age=86400" : "private, no-store");
  res.send(media.data);
});
app.get("/api/posts", (_req,res) => {
  const posts=db.prepare(`SELECT p.id,p.title,p.body,p.created_at,m.id AS media_id,m.mimetype,m.filename
    FROM cms_posts p LEFT JOIN cms_media m ON m.id=p.media_id WHERE p.published=1 ORDER BY p.id DESC LIMIT 50`).all()
    .map(p=>({id:p.id,title:p.title,body:p.body,createdAt:p.created_at,media:p.media_id?{url:"/api/cms/media/"+p.media_id,mimetype:p.mimetype,filename:p.filename}:null}));
  res.json({ok:true,posts});
});


const defaultSiteSettings = {
  theme: { primary: "#d7b36b", accent: "#f0dba7", background: "#0b111a", surface: "#111c29", text: "#f5f2eb", muted: "#aab6c5", font: "Tahoma" },
  brandTitle: "ایران قوی و متحد",
  brandSubtitle: "STRONG AND UNITED IRAN",
  heroTitle: "آیندهٔ ایران،\nبا اندیشه و مشارکت",
  heroLead: "Rise of Iran Initiative یک ابتکار مستقل پژوهشی و مدنی در مرحلهٔ شکل‌گیری است؛ با هدف ایجاد زیرساخت فکری، پژوهشی و مشارکت عمومی برای گفت‌وگو دربارهٔ آیندهٔ ایران.",
  sections: ["hero","about","vision","charter","research","participate","roadmap","transparency","contact"],
  sectionOrder: ["hero","about","vision","charter","research","participate","roadmap","transparency","contact"],
  navItems: [
    {label:"درباره ما",url:"#about"},{label:"چشم‌انداز",url:"#vision"},{label:"منشور",url:"#charter"},
    {label:"پژوهش",url:"#research"},{label:"تازه‌ها",url:"/news.html"},{label:"مشارکت",url:"#participate"},
    {label:"شفافیت",url:"#transparency"},{label:"ارتباط",url:"#contact"}
  ],
  footerText: "یک ابتکار مستقل پژوهشی و مدنی در مرحلهٔ شکل‌گیری."
};
function readSiteSettings() {
  const row = db.prepare("SELECT settings_json FROM site_settings WHERE id=1").get();
  if (!row) return structuredClone(defaultSiteSettings);
  try { const saved = JSON.parse(row.settings_json); if (saved.brandTitle === "رستاخیز ایران") saved.brandTitle = "ایران قوی و متحد"; if (saved.brandSubtitle === "RISE OF IRAN INITIATIVE") saved.brandSubtitle = "STRONG AND UNITED IRAN"; return { ...structuredClone(defaultSiteSettings), ...saved }; }
  catch { return structuredClone(defaultSiteSettings); }
}
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const siteSettingsSchema = z.object({
  theme: z.object({
    primary: hexColor, accent: hexColor, background: hexColor, surface: hexColor, text: hexColor, muted: hexColor,
    font: z.enum(["Tahoma","Arial","Georgia","Verdana","system-ui"])
  }).strict(),
  brandTitle: z.string().trim().min(1).max(80),
  brandSubtitle: z.string().trim().max(100),
  heroTitle: z.string().trim().min(1).max(180),
  heroLead: z.string().trim().min(1).max(700),
  sections: z.array(z.enum(["hero","about","vision","charter","research","participate","roadmap","transparency","contact"])).max(9),
  sectionOrder: z.array(z.enum(["hero","about","vision","charter","research","participate","roadmap","transparency","contact"])).length(9),
  navItems: z.array(z.object({label:z.string().trim().min(1).max(40),url:z.string().trim().min(1).max(200)}).strict()).max(12),
  footerText: z.string().trim().max(300)
}).strict();
app.get("/api/site-settings", (_req,res) => res.json({ok:true,settings:readSiteSettings()}));
app.get("/api/cms/settings", cmsAuth, (_req,res) => res.json({ok:true,settings:readSiteSettings()}));
app.put("/api/cms/settings", cmsAuth, (req,res,next) => {
  try {
    const settings=siteSettingsSchema.parse(req.body);
    if (new Set(settings.sectionOrder).size !== 9 || new Set(settings.sections).size !== settings.sections.length) return res.status(400).json({ok:false,message:"ترتیب یا انتخاب بخش‌ها معتبر نیست."});
    for (const item of settings.navItems) {
      if (!item.url.startsWith("/") && !item.url.startsWith("#") && !item.url.toLowerCase().startsWith("https://")) return res.status(400).json({ok:false,message:"لینک منو باید با / یا # شروع شود یا یک نشانی HTTPS باشد."});
    }
    db.prepare("INSERT INTO site_settings (id,settings_json,updated_at) VALUES (1,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=excluded.updated_at").run(JSON.stringify(settings));
    res.json({ok:true,message:"تنظیمات سایت ذخیره شد.",settings});
  } catch(error) {
    if (error instanceof z.ZodError) return res.status(400).json({ok:false,message:"یکی از تنظیمات معتبر نیست؛ ورودی‌ها را بررسی کن."});
    next(error);
  }
});

const pageInputSchema = z.object({ title:z.string().trim().min(2).max(120), slug:z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(60), body:z.string().max(30000), published:z.boolean() }).strict();
app.get("/api/cms/pages", cmsAuth, (_req,res) => {
  const pages=db.prepare("SELECT id,slug,title,body,published,created_at,updated_at FROM cms_pages ORDER BY id DESC LIMIT 200").all().map(p=>({...p,published:Boolean(p.published)}));
  res.json({ok:true,pages});
});
app.post("/api/cms/pages", cmsAuth, (req,res,next) => {
  try {
    const input=pageInputSchema.parse(req.body);
    const result=db.prepare("INSERT INTO cms_pages (slug,title,body,published) VALUES (@slug,@title,@body,@published)").run({...input,published:input.published?1:0});
    res.status(201).json({ok:true,id:Number(result.lastInsertRowid),message:"صفحه ساخته شد."});
  } catch(error) {
    if(error instanceof z.ZodError) return res.status(400).json({ok:false,message:"عنوان، نشانی کوتاه یا متن صفحه معتبر نیست."});
    if(String(error?.code)==="SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ok:false,message:"این نشانی قبلاً استفاده شده؛ یک نشانی دیگر انتخاب کن."});
    next(error);
  }
});
app.patch("/api/cms/pages/:id", cmsAuth, (req,res,next) => {
  try {
    const id=Number(req.params.id), input=pageInputSchema.parse(req.body);
    if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({ok:false,message:"شناسه صفحه معتبر نیست."});
    const result=db.prepare("UPDATE cms_pages SET slug=@slug,title=@title,body=@body,published=@published,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=@id").run({...input,published:input.published?1:0,id});
    if(!result.changes) return res.status(404).json({ok:false,message:"صفحه پیدا نشد."});
    res.json({ok:true,message:"صفحه به‌روزرسانی شد."});
  } catch(error) {
    if(error instanceof z.ZodError) return res.status(400).json({ok:false,message:"عنوان، نشانی کوتاه یا متن صفحه معتبر نیست."});
    if(String(error?.code)==="SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ok:false,message:"این نشانی قبلاً استفاده شده؛ یک نشانی دیگر انتخاب کن."});
    next(error);
  }
});
app.delete("/api/cms/pages/:id", cmsAuth, (req,res,next) => {
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({ok:false,message:"شناسه صفحه معتبر نیست."});
  try { const result=db.prepare("DELETE FROM cms_pages WHERE id=?").run(id); if(!result.changes)return res.status(404).json({ok:false,message:"صفحه پیدا نشد."}); res.json({ok:true,message:"صفحه حذف شد."}); }
  catch(error){next(error);}
});

app.get("/p/:slug", (req,res) => {
  const slug=String(req.params.slug||"").toLowerCase();
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(404).sendFile("404.html",{root:"public"});
  const page=db.prepare("SELECT title,body FROM cms_pages WHERE slug=? AND published=1").get(slug);
  if(!page) return res.status(404).sendFile("404.html",{root:"public"});
  const escapeHtml=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const body=escapeHtml(page.body).replace(/\r?\n/g,"<br>");
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.setHeader("Cache-Control","no-cache");
  res.send(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.title)} | رستاخیز ایران</title><link rel="stylesheet" href="/home.css"></head><body><header class="top"><div class="wrap nav"><a class="brand" href="/">رستاخیز ایران</a><a class="btn ghost" href="/">صفحه اصلی</a></div></header><main><section class="section"><div class="wrap"><div class="kicker">PAGE</div><h1>${escapeHtml(page.title)}</h1><div class="copy">${body}</div></div></section></main><footer class="footer"><div class="wrap">Rise of Iran Initiative</div></footer><script src="/theme.js" defer></script></body></html>`);
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

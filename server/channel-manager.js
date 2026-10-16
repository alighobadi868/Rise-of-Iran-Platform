import { z } from "zod";
import { XMLParser } from "fast-xml-parser";

export function registerChannelRoutes(app, { db, cmsAuth }) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, processEntities: true });
  const postSchema = z.object({
    title:z.string().trim().min(2).max(180),
    content:z.string().trim().min(1).max(3800),
    mediaUrl:z.string().trim().max(1500).default("").refine(v=>{if(!v)return true;try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password}catch{return false}}),
    mediaType:z.enum(["none","photo","video"]).default("none"),
    scheduledAt:z.string().trim().max(40).default("")
  }).strict();
  const sourceSchema = z.object({
    name:z.string().trim().min(2).max(100),
    url:z.string().trim().url().max(1500).refine(v=>{try{const u=new URL(v);return u.protocol==="https:"&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/i.test(u.hostname)}catch{return false}}),
    autoPublish:z.boolean().default(false)
  }).strict();
  const config=()=>({token:String(process.env.TELEGRAM_BOT_TOKEN||"").trim(),chatId:String(process.env.TELEGRAM_CHAT_ID||"").trim()});
  async function tg(method,payload={}) {
    const token=config().token;
    if(!token)throw Error("TELEGRAM_NOT_CONFIGURED");
    const response=await fetch("https://api.telegram.org/bot"+token+"/"+method,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(18000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw Error(String(data.description||("Telegram API "+method+" failed")).slice(0,300));
    return data.result;
  }
  const safePost=r=>({id:Number(r.id),title:r.title,content:r.content,mediaUrl:r.media_url,mediaType:r.media_type,status:r.status,scheduledAt:r.scheduled_at,publishedAt:r.published_at,telegramMessageId:r.telegram_message_id,sourceId:r.source_id==null?null:Number(r.source_id),sourceUrl:r.source_url,lastError:r.last_error,createdAt:r.created_at,updatedAt:r.updated_at});
  async function publish(id) {
    const c=config();if(!c.token||!c.chatId)throw Error("TELEGRAM_NOT_CONFIGURED");
    const row=db.prepare("SELECT * FROM channel_posts WHERE id=?").get(id);
    if(!row)throw Error("CHANNEL_POST_NOT_FOUND");
    if(row.status==="published")return safePost(row);
    const text=[row.title,row.content].filter(Boolean).join("\n\n").slice(0,4000);
    try {
      let result;
      if(row.media_type==="photo"&&row.media_url) {
        result=await tg("sendPhoto",{chat_id:c.chatId,photo:row.media_url,caption:text.slice(0,1000)});
        if(text.length>1000)await tg("sendMessage",{chat_id:c.chatId,text:text.slice(1000)});
      } else if(row.media_type==="video"&&row.media_url) {
        result=await tg("sendVideo",{chat_id:c.chatId,video:row.media_url,caption:text.slice(0,1000),supports_streaming:true});
        if(text.length>1000)await tg("sendMessage",{chat_id:c.chatId,text:text.slice(1000)});
      } else result=await tg("sendMessage",{chat_id:c.chatId,text,disable_web_page_preview:false});
      db.prepare("UPDATE channel_posts SET status='published',published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),telegram_message_id=?,last_error='',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(String(result.message_id),id);
      return safePost(db.prepare("SELECT * FROM channel_posts WHERE id=?").get(id));
    } catch(e) {
      if(e.message!=="TELEGRAM_NOT_CONFIGURED")db.prepare("UPDATE channel_posts SET status='failed',last_error=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(String(e.message||"Telegram publish failed").slice(0,500),id);
      throw e;
    }
  }
  const feedText=v=>v==null?"":typeof v==="string"||typeof v==="number"?String(v):String(v["#text"]||v["__cdata"]||"");
  function feedLink(v){if(typeof v==="string")return v;if(Array.isArray(v))v=v.find(x=>x&&x["@_rel"]==="alternate")||v[0];return v&&typeof v["@_href"]==="string"?v["@_href"]:feedText(v)}
  function clean(v){return feedText(v).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim()}
  async function importFeed(source) {
    const response=await fetch(source.url,{headers:{"User-Agent":"RiseOfIranChannelManager/1.0","Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, */*"},signal:AbortSignal.timeout(12000),redirect:"follow"});
    if(!response.ok)throw Error("RSS source returned HTTP "+response.status);
    if(Number(response.headers.get("content-length")||0)>1000000)throw Error("RSS feed exceeds 1 MB");
    const xml=await response.text();if(xml.length>1000000)throw Error("RSS feed exceeds 1 MB");
    const parsed=parser.parse(xml);
    const raw=(parsed&&parsed.rss&&parsed.rss.channel&&parsed.rss.channel.item)||(parsed&&parsed.feed&&parsed.feed.entry)||[];
    const items=(Array.isArray(raw)?raw:[raw]).filter(Boolean).slice(0,20);let count=0;
    for(const item of items.reverse()) {
      const title=clean(item.title),link=feedLink(item.link||item.guid||item.id),description=clean(item.description||item.summary||item.content||item["content:encoded"]).slice(0,3200);
      if(!title||!link)continue;let url;try{url=new URL(link,source.url)}catch{continue}
      if(url.protocol!=="https:"||url.username||url.password||db.prepare("SELECT 1 FROM channel_posts WHERE source_url=?").get(url.href))continue;
      const status=source.auto_publish?"scheduled":"draft",scheduledAt=source.auto_publish?new Date().toISOString():null;
      const result=db.prepare("INSERT OR IGNORE INTO channel_posts (title,content,status,scheduled_at,source_id,source_url) VALUES (?,?,?,?,?,?)").run(title.slice(0,180),(description||title).slice(0,3800),status,scheduledAt,source.id,url.href);
      count+=result.changes;
    }
    db.prepare("UPDATE channel_sources SET last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error='' WHERE id=?").run(source.id);
    return count;
  }
  app.get("/api/cms/channels/status",cmsAuth,async(_req,res)=>{
    const c=config();if(!c.token||!c.chatId)return res.json({configured:false,connected:false,canPost:false,message:"برای اتصال واقعی، TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID را در تنظیمات محرمانهٔ Render ثبت کن."});
    try{const bot=await tg("getMe"),chat=await tg("getChat",{chat_id:c.chatId}),member=await tg("getChatMember",{chat_id:c.chatId,user_id:bot.id});const canPost=["creator","administrator"].includes(member.status)&&(member.status==="creator"||member.can_post_messages!==false);res.json({configured:true,connected:true,canPost,botUsername:bot.username||"",chatTitle:chat.title||chat.username||c.chatId,message:canPost?"ربات به کانال متصل است و اجازهٔ انتشار دارد.":"ربات پیدا شد اما مجوز انتشار ندارد."})}catch(e){res.json({configured:true,connected:false,canPost:false,message:String(e.message||"Telegram connection failed").slice(0,300)})}
  });
  app.get("/api/cms/channels/posts",cmsAuth,(_req,res)=>res.json({ok:true,posts:db.prepare("SELECT * FROM channel_posts ORDER BY CASE status WHEN 'scheduled' THEN 0 WHEN 'draft' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,COALESCE(scheduled_at,created_at) ASC,id DESC LIMIT 200").all().map(safePost)}));
  app.post("/api/cms/channels/posts",cmsAuth,(req,res)=>{
    let input;try{input=postSchema.parse(req.body)}catch{return res.status(400).json({ok:false,message:"عنوان، متن یا نشانی رسانه معتبر نیست."})}
    if(input.mediaType!=="none"&&!input.mediaUrl)return res.status(400).json({ok:false,message:"برای عکس یا ویدئو نشانی HTTPS لازم است."});
    if(input.mediaUrl&&input.mediaType==="none")return res.status(400).json({ok:false,message:"نوع رسانه را انتخاب کن."});
    if(input.mediaType!=="none"&&input.title.length+input.content.length>1000)return res.status(400).json({ok:false,message:"عنوان و متن پست رسانه‌ای باید مجموعاً حداکثر ۱۰۰۰ نویسه باشند."});
    let scheduledAt=null,status="draft";if(input.scheduledAt){const time=Date.parse(input.scheduledAt);if(!Number.isFinite(time)||time<=Date.now())return res.status(400).json({ok:false,message:"زمان انتشار باید در آینده باشد."});scheduledAt=new Date(time).toISOString();status="scheduled"}
    const result=db.prepare("INSERT INTO channel_posts (title,content,media_url,media_type,status,scheduled_at) VALUES (?,?,?,?,?,?)").run(input.title,input.content,input.mediaUrl,input.mediaType,status,scheduledAt);
    res.status(201).json({ok:true,id:Number(result.lastInsertRowid),message:status==="scheduled"?"پست زمان‌بندی شد.":"پیش‌نویس ذخیره شد."});
  });
  app.post("/api/cms/channels/posts/:id/publish",cmsAuth,async(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({ok:false,message:"شناسه پست معتبر نیست."});
    try{const post=await publish(id);res.json({ok:true,message:"پست در تلگرام منتشر شد.",post})}catch(e){const status=e.message==="TELEGRAM_NOT_CONFIGURED"?503:e.message==="CHANNEL_POST_NOT_FOUND"?404:502;res.status(status).json({ok:false,message:e.message==="TELEGRAM_NOT_CONFIGURED"?"اتصال تلگرام پیکربندی نشده است؛ هیچ پستی ارسال نشد.":e.message==="CHANNEL_POST_NOT_FOUND"?"پست پیدا نشد.":"انتشار تلگرام انجام نشد: "+String(e.message||"خطای نامشخص").slice(0,220)})}
  });
  app.delete("/api/cms/channels/posts/:id",cmsAuth,(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({ok:false,message:"شناسه معتبر نیست."});
    const row=db.prepare("SELECT status FROM channel_posts WHERE id=?").get(id);if(!row)return res.status(404).json({ok:false,message:"پست پیدا نشد."});
    if(row.status==="published")return res.status(409).json({ok:false,message:"پست منتشرشده از تلگرام حذف نمی‌شود."});
    db.prepare("DELETE FROM channel_posts WHERE id=?").run(id);res.json({ok:true,message:"پست از صف حذف شد."});
  });
  app.get("/api/cms/channels/sources",cmsAuth,(_req,res)=>res.json({ok:true,sources:db.prepare("SELECT * FROM channel_sources ORDER BY id DESC LIMIT 100").all().map(s=>({id:Number(s.id),name:s.name,url:s.url,enabled:Boolean(s.enabled),autoPublish:Boolean(s.auto_publish),lastCheckedAt:s.last_checked_at,lastError:s.last_error,createdAt:s.created_at}))}));
  app.post("/api/cms/channels/sources",cmsAuth,(req,res)=>{
    let input;try{input=sourceSchema.parse(req.body)}catch{return res.status(400).json({ok:false,message:"نام و آدرس عمومی HTTPS برای منبع RSS معتبر نیست."})}
    try{const r=db.prepare("INSERT INTO channel_sources (name,url,auto_publish) VALUES (?,?,?)").run(input.name,input.url,input.autoPublish?1:0);res.status(201).json({ok:true,id:Number(r.lastInsertRowid),message:input.autoPublish?"منبع ثبت شد؛ مطالب تازه در صف انتشار خودکار قرار می‌گیرند.":"منبع ثبت شد؛ مطالب تازه ابتدا پیش‌نویس می‌شوند."})}catch(e){if(String(e.code)==="SQLITE_CONSTRAINT_UNIQUE")return res.status(409).json({ok:false,message:"این منبع قبلاً ثبت شده است."});res.status(500).json({ok:false,message:"ثبت منبع انجام نشد."})}
  });
  app.patch("/api/cms/channels/sources/:id",cmsAuth,(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||typeof req.body?.enabled!=="boolean"||typeof req.body?.autoPublish!=="boolean")return res.status(400).json({ok:false,message:"تنظیمات منبع معتبر نیست."});
    const r=db.prepare("UPDATE channel_sources SET enabled=?,auto_publish=? WHERE id=?").run(req.body.enabled?1:0,req.body.autoPublish?1:0,id);if(!r.changes)return res.status(404).json({ok:false,message:"منبع پیدا نشد."});res.json({ok:true,message:"تنظیمات منبع ذخیره شد."});
  });
  app.delete("/api/cms/channels/sources/:id",cmsAuth,(req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({ok:false,message:"شناسه معتبر نیست."});const r=db.prepare("DELETE FROM channel_sources WHERE id=?").run(id);if(!r.changes)return res.status(404).json({ok:false,message:"منبع پیدا نشد."});res.json({ok:true,message:"منبع حذف شد؛ مطالب واردشده باقی می‌مانند."})});
  app.post("/api/cms/channels/sources/:id/import",cmsAuth,async(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({ok:false,message:"شناسه منبع معتبر نیست."});const source=db.prepare("SELECT * FROM channel_sources WHERE id=?").get(id);if(!source)return res.status(404).json({ok:false,message:"منبع پیدا نشد."});
    try{const count=await importFeed(source);res.json({ok:true,imported:count,message:count+" مطلب تازه به صف اضافه شد."})}catch(e){db.prepare("UPDATE channel_sources SET last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error=? WHERE id=?").run(String(e.message||"RSS import failed").slice(0,400),id);res.status(502).json({ok:false,message:"خواندن RSS انجام نشد: "+String(e.message||"خطای نامشخص").slice(0,200)})}
  });
  app.post("/api/cms/channels/generate",cmsAuth,async(req,res)=>{
    const enabled=process.env.AI_ENABLED==="true"&&Boolean(process.env.AI_API_KEY)&&Boolean(process.env.AI_MODEL);if(!enabled)return res.status(503).json({ok:false,message:"تولید محتوا تا زمان پیکربندی کلید هوش مصنوعی فعال نیست."});
    const prompt=typeof req.body?.prompt==="string"?req.body.prompt.trim():"";if(prompt.length<3||prompt.length>3000)return res.status(400).json({ok:false,message:"موضوع باید ۳ تا ۳۰۰۰ نویسه باشد."});
    try{const base=(process.env.AI_BASE_URL||"https://api.openai.com/v1").replace(/\/+$/,"");const response=await fetch(base+"/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+process.env.AI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.AI_MODEL,temperature:0.65,max_tokens:900,messages:[{role:"system",content:"تو سردبیر حرفه‌ای یک کانال فارسی هستی. محتوای دقیق و قابل انتشار بنویس؛ واقعیت نساز و خروجی را فقط در قالب JSON با کلیدهای title و content بده."},{role:"user",content:prompt}]}),signal:AbortSignal.timeout(25000)});if(!response.ok)return res.status(502).json({ok:false,message:"ارائه‌دهنده هوش مصنوعی پاسخ نداد."});const data=await response.json();const raw=data?.choices?.[0]?.message?.content;if(typeof raw!=="string"||!raw.trim())return res.status(502).json({ok:false,message:"پاسخ هوش مصنوعی خالی بود."});let draft;try{draft=JSON.parse(raw.replace(/^\s*\u0060{3}(?:json)?\s*/i,"").replace(/\s*\u0060{3}$/,""))}catch{return res.status(502).json({ok:false,message:"خروجی هوش مصنوعی JSON معتبر نبود."})}const title=String(draft.title||"").trim().slice(0,180),body=String(draft.content||"").trim().slice(0,3800);if(title.length<2||!body)return res.status(502).json({ok:false,message:"خروجی عنوان یا متن قابل استفاده نداشت."});res.json({ok:true,draft:{title,content:body}})}catch{return res.status(502).json({ok:false,message:"تولید محتوا فعلاً در دسترس نیست."})}
  });
  let running=false;
  async function tick(){if(running)return;const c=config();if(!c.token||!c.chatId)return;running=true;try{const sources=db.prepare("SELECT * FROM channel_sources WHERE enabled=1 ORDER BY id ASC").all();for(const source of sources){const last=Date.parse(source.last_checked_at||"");if(!Number.isFinite(last)||Date.now()-last>10*60*1000){try{await importFeed(source)}catch(e){db.prepare("UPDATE channel_sources SET last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error=? WHERE id=?").run(String(e.message||"RSS import failed").slice(0,400),source.id)}}}const due=db.prepare("SELECT id FROM channel_posts WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at<=? ORDER BY scheduled_at,id LIMIT 5").all(new Date().toISOString());for(const row of due){try{await publish(Number(row.id))}catch{}}}finally{running=false}}
  const timer=setInterval(()=>tick().catch(()=>{}),60000);timer.unref();
}

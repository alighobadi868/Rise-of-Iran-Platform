const toggle=document.getElementById("menu-toggle");const nav=document.getElementById("navlinks");toggle?.addEventListener("click",()=>{const open=nav.classList.toggle("open");toggle.setAttribute("aria-expanded",String(open));});nav?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{nav.classList.remove("open");toggle?.setAttribute("aria-expanded","false");}));document.getElementById("print-charter")?.addEventListener("click",()=>{window.location.href="/charter.html?print=1";});const form=document.getElementById("contact-form");const status=document.getElementById("contact-status");form?.addEventListener("submit",async event=>{event.preventDefault();if(!form.reportValidity())return;const payload=Object.fromEntries(new FormData(form).entries());payload.consent=payload.consent==="on";status.textContent="در حال ارسال پیام…";const button=form.querySelector('button[type="submit"]');button.disabled=true;try{const response=await fetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"ارسال پیام انجام نشد. لطفاً بعداً دوباره تلاش کنید.");status.textContent=data.message||"پیام در سامانه ثبت شد.";form.reset();}catch(error){status.textContent=error.message||"ارتباط با سرور برقرار نشد.";}finally{button.disabled=false;}});

function makeQuickDock(){
 if(document.querySelector(".quick-dock"))return;
 const nav=document.createElement("nav");nav.className="quick-dock";nav.setAttribute("aria-label","دسترسی سریع");
 const links=[
  {href:"/",icon:"⌂",label:"خانه"},
  {href:"/news.html",icon:"▦",label:"تازه‌ها"},
  {href:"/dashboard.html",icon:"◈",label:"پلتفرم"},
  {href:"/#participate",icon:"＋",label:"مشارکت"}
 ];
 for(const item of links){const a=document.createElement("a");a.href=item.href;a.className="quick-dock-item";const i=document.createElement("span");i.className="quick-dock-icon";i.setAttribute("aria-hidden","true");i.textContent=item.icon;const label=document.createElement("span");label.textContent=item.label;a.append(i,label);nav.append(a)}
 document.body.append(nav);
}
function makeLatestMedia(url,title){
 let u;try{u=new URL(url,location.origin);if(!["http:","https:"].includes(u.protocol))return null}catch{return null}
 const host=u.hostname.toLowerCase().replace(/^www\./,"");
 let id="";
 if(host==="youtu.be")id=u.pathname.split("/").filter(Boolean)[0]||"";
 if(["youtube.com","m.youtube.com","youtube-nocookie.com"].includes(host)){
  id=u.pathname==="/watch"?(u.searchParams.get("v")||""):(u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)||[])[1]||"";
 }
 if(/^[\w-]{11}$/.test(id)){
  const frame=document.createElement("iframe");frame.className="update-video";frame.src="https://www.youtube-nocookie.com/embed/"+id;frame.title=title||"ویدئوی مطلب";frame.loading="lazy";frame.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";frame.allowFullscreen=true;return frame;
 }
 if(/\.(jpe?g|png|gif|webp|avif|svg)(?:$)/i.test(u.pathname)){const img=document.createElement("img");img.className="update-media";img.src=u.href;img.alt=title||"تصویر مطلب";img.loading="lazy";return img}
 if(/\.(mp4|webm|ogv|mov|m4v)(?:$)/i.test(u.pathname)){const v=document.createElement("video");v.className="update-video";v.src=u.href;v.controls=true;v.preload="metadata";v.playsInline=true;return v}
 return null;
}
function makeUpdateCard(item){
 const card=document.createElement("article");card.className="update-card";
 const mediaUrl=item.media?.url||"";
 if(mediaUrl){const media=makeLatestMedia(mediaUrl,item.title);if(media)card.append(media)}
 const copy=document.createElement("div");copy.className="update-copy";
 const date=document.createElement("span");date.className="update-date";date.textContent=item.createdAt?new Date(item.createdAt).toLocaleDateString("fa-IR"):"تازه منتشرشده";
 const title=document.createElement("h3");title.textContent=item.title||"مطلب تازه";
 const body=document.createElement("p");body.textContent=String(item.body||"").replace(/https?:\/\/[^\s]+/g,"رسانهٔ پیوست").slice(0,210);
 copy.append(date,title);if(item.body)copy.append(body);
 const link=document.createElement("a");link.className="update-open";link.href="/news.html#post-"+encodeURIComponent(item.id);link.textContent="مشاهدهٔ مطلب و رسانه ←";copy.append(link);
 card.append(copy);return card;
}
async function loadLatestUpdates(){
 const anchor=document.getElementById("about");if(!anchor)return;
 let host=document.getElementById("latest-updates");
 if(!host){
  host=document.createElement("section");host.id="latest-updates";host.className="section alt";
  const wrap=document.createElement("div");wrap.className="wrap";
  const head=document.createElement("div");head.className="section-head";
  const titleWrap=document.createElement("div");const kicker=document.createElement("div");kicker.className="kicker";kicker.textContent="LATEST / LIVE UPDATES";
  const title=document.createElement("h2");title.textContent="تازه‌ترین مطالب و رسانه‌ها";titleWrap.append(kicker,title);
  const intro=document.createElement("p");intro.textContent="خبرها، دیدگاه‌ها، تصاویر و ویدئوهای تازه را همین‌جا ببین.";
  head.append(titleWrap,intro);
  const grid=document.createElement("div");grid.id="latest-feed";grid.className="updates-grid";grid.setAttribute("aria-live","polite");
  const actions=document.createElement("div");actions.className="updates-actions";
  const all=document.createElement("a");all.className="btn primary";all.href="/news.html";all.textContent="دیدن همهٔ تازه‌ها ←";
  const platform=document.createElement("a");platform.className="btn ghost";platform.href="/dashboard.html";platform.textContent="ورود به پلتفرم";
  actions.append(all,platform);wrap.append(head,grid,actions);host.append(wrap);anchor.parentNode.insertBefore(host,anchor);
 }
 const grid=document.getElementById("latest-feed");
 try{
  const response=await fetch("/api/posts",{headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("feed unavailable");
  const data=await response.json();grid.replaceChildren();
  const posts=Array.isArray(data.posts)?data.posts:[];
  if(!posts.length){
   const card=document.createElement("article");card.className="update-card update-placeholder";
   const copy=document.createElement("div");copy.className="update-copy";const kicker=document.createElement("span");kicker.className="kicker";kicker.textContent="آغاز انتشار";
   const title=document.createElement("h3");title.textContent="مطالب تازه به‌زودی در این بخش نمایش داده می‌شوند";
   const body=document.createElement("p");body.textContent="با انتشار مطلب از پنل مدیریت، کارت محتوا و رسانه به‌صورت خودکار اینجا ظاهر می‌شود.";
   copy.append(kicker,title,body);card.append(copy);grid.append(card);return;
  }
  posts.slice(0,6).forEach(item=>grid.append(makeUpdateCard(item)));
 }catch{
  grid.replaceChildren();const card=document.createElement("article");card.className="update-card update-placeholder";
  const copy=document.createElement("div");copy.className="update-copy";const title=document.createElement("h3");title.textContent="تازه‌ها فعلاً بارگذاری نشدند";
  const link=document.createElement("a");link.className="update-open";link.href="/news.html";link.textContent="بازکردن آرشیو ←";copy.append(title,link);card.append(copy);grid.append(card);
 }
}
makeQuickDock();
loadLatestUpdates();

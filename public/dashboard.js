const labels={home:"نمای کلی",charter:"منشور ایران نوین",feed:"ویدئو و دیدگاه‌ها",career:"راهنمای شغلی",experts:"شبکهٔ متخصصان",founder:"ارتباط و پیشنهادها",invite:"دعوت به همکاری"};
function view(id){document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id===id));document.querySelectorAll(".navitem").forEach(x=>x.classList.toggle("active",x.dataset.view===id));const h=document.querySelector("#"+id+" .pagehead h1");document.title=(h?.textContent||labels[id]||"رستاخیز ایران")+" | رستاخیز ایران";if(id==="feed")loadFeed();window.scrollTo({top:0,behavior:"smooth"});}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();view(b.dataset.view)}));
const show=(id,text)=>{const el=document.getElementById(id);el.textContent=text;el.classList.add("show")};
async function postForm(form,status,endpoint,fields){const f=new FormData(form),payload={};for(const k of fields)payload[k]=f.get(k);payload.consent=f.get("consent")==="on";show(status,"در حال ارسال…");try{const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.message||"درخواست انجام نشد.");show(status,d.message||"درخواست ثبت شد.");form.reset()}catch(e){show(status,e.message||"ارتباط با سرور برقرار نشد.")}}
document.getElementById("ask").addEventListener("click",async()=>{const question=document.getElementById("question").value.trim();if(question.length<3)return show("answer","لطفاً سؤال کامل‌تری بنویس.");show("answer","در حال بررسی سؤال…");try{const r=await fetch("/api/charter/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question})});const d=await r.json();show("answer",d.answer||d.message||"پاسخی در دسترس نیست.")}catch{show("answer","اتصال به سرور برقرار نشد.")}});
document.getElementById("career-submit").addEventListener("click",async()=>{show("career-answer","در حال ساخت راهنما…");try{const r=await fetch("/api/career/guide",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:document.getElementById("job").value,concern:document.getElementById("concern").value})});const d=await r.json();show("career-answer",d.answer||d.message||"راهنما در دسترس نیست.")}catch{show("career-answer","اتصال به سرور برقرار نشد.")}});
const cf=document.getElementById("contact-form");cf.addEventListener("submit",e=>{e.preventDefault();if(cf.reportValidity())postForm(cf,"contact-status","/api/contact",["name","email","subject","message"])});
const ef=document.getElementById("expert-form");ef.addEventListener("submit",e=>{e.preventDefault();if(ef.reportValidity())postForm(ef,"expert-status","/api/experts",["name","email","degree","field","experience","videoUrl"])});
const inf=document.getElementById("invite-form");inf.addEventListener("submit",e=>{e.preventDefault();if(inf.reportValidity())postForm(inf,"invite-status","/api/invitations",["email","message"])});
document.getElementById("invite-link").value=location.origin;document.getElementById("copy-link").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(location.origin);document.getElementById("copy-link").textContent="کپی شد"}catch{document.getElementById("invite-link").select()}});
const fileInput=document.getElementById("video-file");fileInput.addEventListener("change",()=>{const f=fileInput.files[0];if(f&&f.size>50*1024*1024){fileInput.value="";show("upload-status","حجم ویدئو باید حداکثر ۵۰ مگابایت باشد.")}});
document.getElementById("video-form").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;const file=fileInput.files[0];if(!file)return;if(file.size>50*1024*1024)return show("upload-status","حجم ویدئو باید حداکثر ۵۰ مگابایت باشد.");const payload=new FormData(form);show("upload-status","در حال بارگذاری ویدئو؛ لطفاً صفحه را نبند…");try{const r=await fetch("/api/videos",{method:"POST",body:payload});const d=await r.json();if(!r.ok)throw new Error(d.message||"بارگذاری انجام نشد.");show("upload-status","ویدئو بارگذاری شد و در فید نمایش داده می‌شود.");form.reset();await loadFeed()}catch(err){show("upload-status",err.message||"بارگذاری انجام نشد.")}});
async function loadFeed(){const feed=document.getElementById("video-feed");feed.innerHTML='<p class="muted">در حال دریافت ویدئوها…</p>';try{const r=await fetch("/api/videos");const d=await r.json();if(!r.ok)throw new Error();if(!d.videos?.length){feed.innerHTML='<div class="panel"><p class="muted">هنوز ویدئویی منتشر نشده است. اولین ویدئو را بارگذاری کن.</p></div>';return}feed.innerHTML="";for(const v of d.videos){const card=document.createElement("article");card.className="post";const video=document.createElement("video");video.controls=true;video.preload="metadata";video.src=v.url;video.playsInline=true;const body=document.createElement("div");body.className="post-body";const h=document.createElement("h3");h.textContent=v.title;const p=document.createElement("p");p.textContent=(v.category||"دیدگاه")+(v.description?" · "+v.description:"");body.append(h,p);card.append(video,body);feed.append(card)}}catch{feed.innerHTML='<div class="panel"><p class="muted">فید ویدئو فعلاً در دسترس نیست.</p></div>'}}
document.getElementById("refresh-feed").addEventListener("click",loadFeed);loadFeed();


(function addPlatformDock(){
 if(document.querySelector(".platform-dock"))return;
 const style=document.createElement("style");
 style.textContent=".platform-dock{position:fixed;z-index:50;left:18px;bottom:18px;display:flex;gap:7px;padding:8px;border:1px solid #ffffff22;border-radius:18px;background:#0b111aee;box-shadow:0 12px 38px #0007;backdrop-filter:blur(14px)}.platform-dock a{width:68px;min-height:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:12px;color:#f4f2ed;font-size:10px;text-decoration:none}.platform-dock a:hover,.platform-dock a.active{background:#ffffff12;color:#f1dcae}.platform-dock i{font-style:normal;width:31px;height:31px;display:grid;place-items:center;border:1px solid #283646;border-radius:10px;color:#f1dcae;font-size:18px;background:#ffffff07}@media(max-width:560px){.platform-dock{left:9px;right:9px;bottom:9px;justify-content:space-around;gap:3px;padding:5px}.platform-dock a{width:auto;flex:1;min-height:52px}.platform-dock i{width:28px;height:28px}body{padding-bottom:78px}}";
 document.head.append(style);
 const nav=document.createElement("nav");nav.className="platform-dock";nav.setAttribute("aria-label","دسترسی سریع");
 const items=[
  {icon:"⌂",label:"خانه",href:"/",external:true},
  {icon:"▦",label:"تازه‌ها",href:"/news.html",external:true},
  {icon:"▶",label:"ویدئوها",view:"feed"},
  {icon:"✧",label:"متخصصان",view:"experts"},
  {icon:"✉",label:"ارتباط",view:"founder"}
 ];
 for(const item of items){
  const a=document.createElement("a");a.href=item.href||("#"+item.view);if(item.view)a.dataset.view=item.view;
  const icon=document.createElement("i");icon.setAttribute("aria-hidden","true");icon.textContent=item.icon;
  const label=document.createElement("span");label.textContent=item.label;a.append(icon,label);
  if(item.view)a.addEventListener("click",event=>{event.preventDefault();view(item.view)});
  nav.append(a);
 }
 document.body.append(nav);
})();

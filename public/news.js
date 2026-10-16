const $=s=>document.querySelector(s);
const safeUrl=value=>{try{const u=new URL(value,location.origin);return ["https:","http:"].includes(u.protocol)?u:null}catch{return null}};
function makeMedia(url,title){
 const u=safeUrl(url);if(!u)return null;
 const host=u.hostname.toLowerCase().replace(/^www\./,"");
 let yt="";
 if(host==="youtu.be")yt=u.pathname.split("/").filter(Boolean)[0]||"";
 if(["youtube.com","m.youtube.com","youtube-nocookie.com"].includes(host)){
  if(u.pathname==="/watch")yt=u.searchParams.get("v")||"";
  else if(/^\/(embed|shorts|live)\//.test(u.pathname))yt=u.pathname.split("/")[2]||"";
 }
 if(/^[\w-]{11}$/.test(yt)){
  const frame=document.createElement("iframe");frame.className="media media-frame";frame.src="https://www.youtube-nocookie.com/embed/"+yt;
  frame.title=title||"ویدئوی منتشرشده";frame.loading="lazy";frame.referrerPolicy="strict-origin-when-cross-origin";
  frame.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";frame.allowFullscreen=true;return frame;
 }
 if(host==="vimeo.com"||host==="player.vimeo.com"){
  const id=(u.pathname.match(/\/(?:video\/)?(\d+)/)||[])[1];
  if(id){const frame=document.createElement("iframe");frame.className="media media-frame";frame.src="https://player.vimeo.com/video/"+id;frame.title=title||"ویدئوی منتشرشده";frame.loading="lazy";frame.allow="autoplay; fullscreen; picture-in-picture";frame.allowFullscreen=true;return frame}
 }
 if(/\.(jpe?g|png|gif|webp|avif|svg)(?:$)/i.test(u.pathname)){
  const img=document.createElement("img");img.className="media";img.src=u.href;img.alt=title||"تصویر مطلب";img.loading="lazy";img.referrerPolicy="no-referrer";return img;
 }
 if(/\.(mp4|webm|ogv|mov|m4v)(?:$)/i.test(u.pathname)){
  const video=document.createElement("video");video.className="media";video.src=u.href;video.controls=true;video.preload="metadata";video.playsInline=true;return video;
 }
 return null;
}
function appendBody(container,text,title){
 const urlPattern=/https?:\/\/[^\s<>"']+/gi;
 for(const line of String(text||"").split(/\n{2,}/)){
  const p=document.createElement("p");p.className="post-copy";
  let last=0,match;urlPattern.lastIndex=0;
  while((match=urlPattern.exec(line))){
   let raw=match[0],trimmed=raw.replace(/[),.!?،؛]+$/,""),tail=raw.slice(trimmed.length);
   p.append(document.createTextNode(line.slice(last,match.index)));
   const media=makeMedia(trimmed,title);
   if(media){if(p.childNodes.length)container.append(p);container.append(media);if(tail)container.append(document.createTextNode(tail));}
   else {const a=document.createElement("a");a.href=trimmed;a.textContent=trimmed;a.target="_blank";a.rel="noopener noreferrer";p.append(a);if(tail)p.append(document.createTextNode(tail));}
   last=match.index+raw.length;
  }
  p.append(document.createTextNode(line.slice(last)));
  if(p.textContent.trim()||p.querySelector("a"))container.append(p);
 }
}
function appendAttachedMedia(card,item){
 if(!item.media?.url)return;
 const media=makeMedia(item.media.url,item.title);
 if(media)card.append(media);
}
async function load(){
 const host=$("#news");if(!host)return;
 try{
  const r=await fetch("/api/posts",{headers:{Accept:"application/json"}});
  const d=await r.json();if(!r.ok)throw Error("posts unavailable");
  host.replaceChildren();
  if(!d.posts?.length){const p=document.createElement("p");p.className="empty";p.textContent="هنوز مطلبی منتشر نشده است.";host.append(p);return}
  for(const item of d.posts){
   const card=document.createElement("article");card.className="post";
   const h=document.createElement("h2");h.textContent=item.title||"مطلب تازه";
   const date=document.createElement("div");date.className="date";date.textContent=item.createdAt?new Date(item.createdAt).toLocaleDateString("fa-IR"):"تازه منتشرشده";
   card.append(h,date);
   if(item.body)appendBody(card,item.body,item.title);
   appendAttachedMedia(card,item);
   host.append(card);
  }
 }catch{host.textContent="فعلاً دریافت مطالب ممکن نیست."}
}
load();
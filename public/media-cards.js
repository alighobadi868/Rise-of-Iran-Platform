function createAttachedMedia(item){
 if(!item.media||!item.media.url)return null;
 const url=item.media.url,mime=String(item.media.mimetype||"").toLowerCase();
 if(mime.startsWith("video/")){
  const video=document.createElement("video");video.className="update-video";video.src=url;video.controls=true;video.preload="metadata";video.playsInline=true;return video;
 }
 if(mime.startsWith("image/")){
  const image=document.createElement("img");image.className="update-media";image.src=url;image.alt=item.title||"تصویر مطلب";image.loading="lazy";return image;
 }
 return null;
}
async function hydrateLatestMedia(){
 const host=document.getElementById("latest-feed");if(!host)return;
 try{
  const response=await fetch("/api/posts",{headers:{Accept:"application/json"}});
  if(!response.ok)return;
  const data=await response.json();
  for(const item of (Array.isArray(data.posts)?data.posts:[])){
   const link=document.querySelector('a[href="/news.html#post-'+item.id+'"]');
   const card=link?.closest(".update-card");
   if(!card||card.querySelector("[data-attached-media]"))continue;
   const media=createAttachedMedia(item);if(!media)continue;
   media.setAttribute("data-attached-media","true");card.insertBefore(media,card.firstChild);
  }
 }catch{}
}
function watchLatestMedia(){
 const host=document.getElementById("latest-feed");
 if(host)new MutationObserver(()=>hydrateLatestMedia()).observe(host,{childList:true,subtree:true});
 hydrateLatestMedia();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",watchLatestMedia,{once:true});else watchLatestMedia();
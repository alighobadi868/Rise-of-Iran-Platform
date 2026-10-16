const host=document.getElementById("verification-requests");
async function loadVerificationRequests(){
 if(!host)return;
 host.textContent="در حال بارگذاری…";
 try{
  const response=await fetch("/api/cms/verification-requests");
  const data=await response.json();
  if(!response.ok)throw new Error(data.message||"درخواست‌ها بارگذاری نشدند.");
  host.replaceChildren();
  if(!data.requests.length){host.textContent="هنوز درخواستی ثبت نشده است.";return}
  for(const item of data.requests){
   const card=document.createElement("article");card.className="post";
   const title=document.createElement("h3");title.textContent=item.fullName;
   const info=document.createElement("p");info.textContent=item.email+" · "+item.organization;
   const reason=document.createElement("p");reason.textContent=item.reason;
   const status=document.createElement("p");status.textContent="وضعیت: "+item.status;
   card.append(title,info,reason,status);
   if(item.profileUrl){const link=document.createElement("a");link.href=item.profileUrl;link.textContent="مشاهده پروفایل ↗";link.target="_blank";link.rel="noopener noreferrer";card.append(link)}
   host.append(card);
  }
 }catch(error){host.textContent=error.message}
}
document.getElementById("refresh-verification")?.addEventListener("click",loadVerificationRequests);
const editor=document.getElementById("editor");
if(editor)new MutationObserver(()=>{if(!editor.hidden)loadVerificationRequests()}).observe(editor,{attributes:true,attributeFilter:["hidden"]});

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
   if(item.adminNote){const note=document.createElement("p");note.textContent="یادداشت بررسی: "+item.adminNote;card.append(note)}
   if(item.status==="pending"){
    const noteLabel=document.createElement("label");noteLabel.textContent="یادداشت برای متقاضی";
    const noteInput=document.createElement("textarea");noteInput.rows=3;noteInput.maxLength=500;noteInput.placeholder="در صورت نیاز، دلیل تأیید یا اصلاح را بنویس…";noteInput.value=item.adminNote||"";
    noteLabel.append(noteInput);card.append(noteLabel);
    const actions=document.createElement("div");actions.className="post-actions";
    for(const choice of [{value:"approved",label:"تأیید بررسی پروفایل"},{value:"rejected",label:"درخواست اصلاح"}]){
     const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent=choice.label;
     button.addEventListener("click",async()=>{
      button.disabled=true;
      try{const result=await fetch("/api/cms/verification-requests/"+item.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:choice.value,adminNote:noteInput.value.trim()})});const body=await result.json();if(!result.ok)throw new Error(body.message||"به‌روزرسانی انجام نشد.");await loadVerificationRequests();}
      catch(error){button.disabled=false;alert(error.message)}
     });
     actions.append(button);
    }
    card.append(actions);
   }
   if(item.profileUrl){const link=document.createElement("a");link.href=item.profileUrl;link.textContent="مشاهده پروفایل ↗";link.target="_blank";link.rel="noopener noreferrer";card.append(link)}
   host.append(card);
  }
 }catch(error){host.textContent=error.message}
}
document.getElementById("refresh-verification")?.addEventListener("click",loadVerificationRequests);
const editor=document.getElementById("editor");
if(editor)new MutationObserver(()=>{if(!editor.hidden)loadVerificationRequests()}).observe(editor,{attributes:true,attributeFilter:["hidden"]});

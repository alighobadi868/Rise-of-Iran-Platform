const $=selector=>document.querySelector(selector);
const authPanel=$("#auth-panel"),accountPanel=$("#account-panel");
const loginForm=$("#login-form"),registerForm=$("#register-form"),verificationForm=$("#verification-form");
let currentUser=null;
async function api(url,options={}) {
 const response=await fetch(url,{...options,headers:{"Accept":"application/json",...(options.headers||{})}});
 const data=await response.json().catch(()=>({message:"پاسخ سرور قابل خواندن نیست."}));
 if(!response.ok)throw new Error(data.message||"درخواست انجام نشد.");
 return data;
}
function showStatus(id,message){const el=$("#"+id);if(el)el.textContent=message||""}
function switchMode(mode){
 const registering=mode==="register";
 loginForm.hidden=registering;registerForm.hidden=!registering;
 document.querySelectorAll(".tab").forEach(tab=>tab.classList.toggle("active",tab.dataset.mode===mode));
}
document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>switchMode(tab.dataset.mode)));
async function submitAuth(form,endpoint,statusId){
 const button=form.querySelector('button[type="submit"]');button.disabled=true;showStatus(statusId,"در حال بررسی اطلاعات…");
 try{
  const payload=Object.fromEntries(new FormData(form).entries());
  const data=await api(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  form.reset();showStatus(statusId,data.message||"انجام شد.");await refreshAccount();
 }catch(error){showStatus(statusId,error.message||"ارتباط با سرور برقرار نشد.");}
 finally{button.disabled=false;}
}
loginForm.addEventListener("submit",event=>{event.preventDefault();if(loginForm.reportValidity())submitAuth(loginForm,"/api/auth/login","login-status")});
registerForm.addEventListener("submit",event=>{event.preventDefault();if(registerForm.reportValidity())submitAuth(registerForm,"/api/auth/register","register-status")});
$("#logout").addEventListener("click",async()=>{
 try{await api("/api/auth/logout",{method:"POST"});}catch{}
 currentUser=null;accountPanel.hidden=true;authPanel.hidden=false;switchMode("login");showStatus("login-status","از حساب خارج شدی.");
});
const states={
 not_submitted:["تکمیل‌نشده","برای شروع، فرم بررسی پروفایل را تکمیل کن."],
 pending:["در انتظار بررسی","درخواست ثبت شده است؛ نشان تأیید تا پایان بررسی صادر نمی‌شود."],
 verified:["تأییدشده توسط مدیر","درخواست پروفایل توسط مدیر بررسی و تأیید شده است؛ این تأیید دولتی یا مدرکی نیست."],
 rejected:["نیازمند اصلاح","درخواست قبلی تأیید نشد. توضیح مدیر را ببین و در صورت نیاز دوباره ارسال کن."],
 approved:["تأییدشده توسط مدیر","درخواست پروفایل توسط مدیر بررسی و تأیید شده است؛ این تأیید دولتی یا مدرکی نیست."]
};
function setVerificationState(status,request){
 const normalized=status==="approved"?"verified":(status||"not_submitted");
 const copy=states[normalized]||states.not_submitted;
 $("#verification-badge").textContent=copy[0];$("#verification-summary").textContent=copy[1];
 $("#verification-form").hidden=normalized==="verified"||normalized==="pending";
 const details=$("#request-details");
 if(request){
  details.hidden=false;
  const lines=["وضعیت درخواست: "+(states[request.status]?.[0]||request.status),"تاریخ ثبت: "+(request.submittedAt?new Date(request.submittedAt).toLocaleDateString("fa-IR"):"—")];
  if(request.adminNote)lines.push("یادداشت مدیر: "+request.adminNote);
  details.textContent=lines.join("\n");
 }else{details.hidden=true;details.textContent=""}
}
async function loadVerification(){
 try{
  const data=await api("/api/auth/verification");
  const request=data.request;
  setVerificationState(request?.status||currentUser?.verificationStatus,request);
 }catch(error){showStatus("verification-form-status",error.message)}
}
async function refreshAccount(){
 try{
  const data=await api("/api/auth/status");
  currentUser=data.authenticated?data.user:null;
  if(!currentUser){authPanel.hidden=false;accountPanel.hidden=true;return}
  authPanel.hidden=true;accountPanel.hidden=false;
  $("#user-name").textContent=currentUser.name;$("#user-email").textContent=currentUser.email;
  await loadVerification();
 }catch{authPanel.hidden=false;accountPanel.hidden=true}
}
verificationForm.addEventListener("submit",async event=>{
 event.preventDefault();if(!verificationForm.reportValidity())return;
 const button=verificationForm.querySelector('button[type="submit"]');button.disabled=true;showStatus("verification-form-status","در حال ثبت درخواست…");
 try{
  const payload=Object.fromEntries(new FormData(verificationForm).entries());payload.consent=payload.consent==="on";
  const data=await api("/api/auth/verification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  showStatus("verification-form-status",data.message||"درخواست ثبت شد.");verificationForm.reset();await refreshAccount();
 }catch(error){showStatus("verification-form-status",error.message||"درخواست ثبت نشد.");}
 finally{button.disabled=false}
});
refreshAccount();
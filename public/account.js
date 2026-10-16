const $=selector=>document.querySelector(selector);
const authPanel=$("#auth-panel"),accountPanel=$("#account-panel");
const loginForm=$("#login-form"),registerForm=$("#register-form");
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
 accountPanel.hidden=true;authPanel.hidden=false;switchMode("login");showStatus("login-status","از حساب خارج شدی.");
});
async function refreshAccount(){
 try{
  const data=await api("/api/auth/status");
  if(!data.authenticated){authPanel.hidden=false;accountPanel.hidden=true;return}
  authPanel.hidden=true;accountPanel.hidden=false;
  $("#user-name").textContent=data.user.name;$("#user-email").textContent=data.user.email;
  $("#verification-badge").textContent="عضو پلتفرم";
  $("#verification-summary").textContent="عضویت فعال است؛ برای ادامه وارد پلتفرم شو. برای عضویت مدرک هویتی لازم نیست.";
 }catch{authPanel.hidden=false;accountPanel.hidden=true}
}
refreshAccount();

import {reminderEmail} from '../lib/reminder-email.js';
import {authenticated,sameOrigin,json,body} from '../lib/admin-auth.js';
import {getStore} from '../lib/store.js';
export default async function handler(req,res){
 if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});
 const configured=!!(process.env.RESEND_API_KEY&&process.env.REMINDER_FROM);
 if(req.method==='GET')return json(res,200,{configured,from:process.env.REMINDER_FROM||null,replyTo:process.env.REMINDER_REPLY_TO||null});
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 if(!sameOrigin(req))return json(res,403,{error:'Please use this website.'});
 if(!configured)return json(res,503,{error:'Resend API key or sender address is missing.'});
 let slot;try{const input=body(req);slot=input.slot==='morning'?'morning':'evening';}catch{return json(res,400,{error:'Invalid request.'});}
 try{
  if(!await getStore().allowRequest('admin-email-test'))return json(res,429,{error:'Too many tests. Try again later.'});
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'wogb-branded-reminder-v3-'+slot+'-'+new Date().toISOString().slice(0,10)},body:JSON.stringify({from:process.env.REMINDER_FROM,to:['rayeschiller@gmail.com'],reply_to:process.env.REMINDER_REPLY_TO||'rayeschiller@gmail.com',...reminderEmail({test:true,slot})}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();
  if(!response.ok){console.error('Email test rejected:',response.status,result.name);return json(res,502,{error:result.message||'Resend rejected the test email.',providerStatus:response.status});}
  return json(res,200,{ok:true,emailId:result.id,to:'rayeschiller@gmail.com',from:process.env.REMINDER_FROM,status:'accepted'});
 }catch(error){console.error('Email test failed:',error.name);return json(res,503,{error:'Email test failed. Try again.'});}
}

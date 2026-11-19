import {digest,token} from './participant-auth.js';
import {FOUNDING,NEXT,signupPath,paymentPath} from './cohorts.js';
import {welcomeEmail} from './welcome-email.js';
// Store the exact payload and key before contacting the provider. Retries reuse both.
export function createWelcomeSender({read,write,prepareLink,deliver,config,now=()=>Date.now()}){
 return async function sendWelcome(id,cohort=FOUNDING){
  let path,locked;
  try{
   const [signup,payment]=await Promise.all([read(signupPath(id,cohort)),read(paymentPath(id,cohort))]);
   if(!signup||!payment?.data.paid||!payment.data.enrolled||(cohort===NEXT&&payment.data.signupCreatedAt!==signup.data.createdAt))return {status:'skipped'};
   path='welcome/'+cohort+'/'+id+'/'+digest(signup.data.createdAt)+'.json';
   let previous=await read(path);
   if(previous?.data.status==='sent')return {status:'already_sent'};
   const settings=config();
   if(!settings.enabled)return {status:'failed',message:'Welcome email is not configured. The enrollment is saved.'};
   const time=now();
   if(previous?.data.firstAttemptAt&&time-previous.data.firstAttemptAt>=23*3600000)return {status:'review',message:'Welcome email delivery needs review before retrying. Use the private login link if needed.'};
   if(previous?.data.leaseUntil>time)return {status:'processing',message:'Welcome email is being sent.'};
   const record={...(previous?.data||{signupCreatedAt:signup.data.createdAt,access:token(),expiresAt:new Date(time+72*3600000).toISOString(),key:'wogb-welcome-'+cohort+'-'+id+'-'+digest(signup.data.createdAt).slice(0,16)}),status:'pending',leaseUntil:time+90000};
   try{locked=await write(path,record,previous);}catch{return {status:'processing',message:'Welcome email is being prepared. Retry shortly if needed.'};}
   if(!locked.data.payload){
    const link=await prepareLink({id,cohort,signup:signup.data,access:record.access,expiresAt:record.expiresAt,origin:settings.origin});
    const payload={from:settings.from,to:[signup.data.email],...(settings.replyTo?{reply_to:settings.replyTo}:{}),...welcomeEmail({name:signup.data.name,...link})};
    locked=await write(path,{...locked.data,payload},locked);
   }
   // Confirm enrollment is still current immediately before sending.
   const [currentSignup,currentPayment]=await Promise.all([read(signupPath(id,cohort)),read(paymentPath(id,cohort))]);
   if(currentSignup?.data.createdAt!==signup.data.createdAt||!currentPayment?.data.paid||!currentPayment.data.enrolled||(cohort===NEXT&&currentPayment.data.signupCreatedAt!==signup.data.createdAt)){
    await write(path,{...locked.data,leaseUntil:0},locked);return {status:'skipped'};
   }
   locked=await write(path,{...locked.data,firstAttemptAt:locked.data.firstAttemptAt||now()},locked);
   const emailId=await deliver(locked.data.payload,locked.data.key);
   // Drop the setup URL/token once accepted; keep a permanent deduplication receipt.
   await write(path,{status:'sent',signupCreatedAt:signup.data.createdAt,emailId,sentAt:new Date(now()).toISOString()},locked);
   return {status:'sent'};
  }catch(error){
   if(path&&locked){try{await write(path,{...locked.data,leaseUntil:0},locked);}catch{}}
   console.error('Welcome email failed:',error.name);
   return {status:'failed',message:'Enrollment saved, but the welcome email could not be confirmed. Retry the welcome email.'};
  }
 };
}

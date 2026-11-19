import {normalizeSocialProfile} from '../public/social-profile.js';
import {FOUNDING, NEXT} from './cohorts.js';
import {nextRegistrationOpen} from './next-cohort.js';
import {getStore} from './store.js';

function send(res,status,payload) {
  res.setHeader('Cache-Control','no-store');
  res.status(status).json(payload);
}
export async function handle(req,res,action,storage=getStore) {
  if(req.method!=='POST') {
    res.setHeader('Allow','POST');
    return send(res,405,{error:'POST required.'});
  }
  const origin=req.headers.origin;
  try {
    if(origin && new URL(origin).host!==req.headers.host) return send(res,403,{error:'Please submit from this website.'});
  } catch {return send(res,403,{error:'Invalid origin.'});}
  if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSON required.'});
  if(Number(req.headers['content-length']||0)>4096)return send(res,413,{error:'Request too large.'});
  let data;
  try {
    data=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!data || typeof data!=='object' || Array.isArray(data)) throw Error();
    if(Buffer.byteLength(JSON.stringify(data))>4096)return send(res,413,{error:'Request too large.'});
  }catch{return send(res,400,{error:'Invalid request.'});}
  if(data.website)return send(res,200,{ok:true});
  const email=String(data.email||'').trim().toLowerCase();
  const rawPhone=String(data.phone||'').trim();
  let digits=rawPhone.replace(/\D/g,'');
  if(digits.length===11 && digits.startsWith('1'))digits=digits.slice(1);
  const phone=/^\+?[\d\s().-]+$/.test(rawPhone) && /^[2-9]\d{9}$/.test(digits)?'+1'+digits:'';
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return send(res,400,{error:'Enter a valid email address.'});
  if(!phone)return send(res,400,{error:'Enter your 10-digit US phone number.'});
  const name=String(data.name||'').trim();
  if(action==='signup' && (!name || name.length>100 || data.consent!==true || typeof data.sms!=='boolean'))return send(res,400,{error:'Add your name and agree to cohort email updates.'});
  const socialProfile=action==='signup'?normalizeSocialProfile(data.socialProfile):null;
  if(action==='signup'&&!socialProfile)return send(res,400,{error:'Add a link to your Instagram or TikTok profile.'});
  const cohort=data.cohort ?? FOUNDING;
  if(cohort!==FOUNDING && (cohort!==NEXT || action!=='signup'))return send(res,400,{error:'Invalid cohort.'});
  try {
    const store=storage();
    const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'anonymous').split(',')[0].trim();
    if(!await store.allowRequest(cohort===NEXT?'november-signup:'+ip:ip))return send(res,429,{error:'Too many requests. Please try again in 10 minutes.'});
    if(action==='remove') {
      await store.remove(email,phone);
    } else {
      if(cohort===NEXT && !await nextRegistrationOpen())return send(res,409,{error:'Registration for the November cohort is closed.'});
      await store.add({name,email,phone,socialProfile,sms:data.sms,...(cohort===NEXT?{source:'new'}:{})},cohort);
    }
    return send(res,200,{ok:true});
  }catch(error){
    // Keep contact details, SQL parameters and connection strings out of logs.
    console.error('Signup API failed:',error.name);
    return send(res,503,{error:'Signup is temporarily unavailable. Please try again shortly.'});
  }
}

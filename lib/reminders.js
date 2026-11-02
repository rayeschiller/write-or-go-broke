import {reminderEmail} from './reminder-email.js';
import {put,BlobPreconditionFailedError} from '@vercel/blob';
import {read,documents,getStore} from './store.js';
import {settings} from './participant-store.js';
import {COHORT,challengeState} from './challenge.js';
export function reminderWindow(schedule,now=new Date()){
 const state=challengeState(schedule,now);
 const hour=schedule.timezone?Number(new Intl.DateTimeFormat('en-US',{timeZone:schedule.timezone,hour:'2-digit',hourCycle:'h23'}).format(now)):null;
 return {...state,slot:hour===9?'morning':hour===21?'evening':null,due:state.phase==='active'&&(hour===9||hour===21)};
}
export function needsReminder(person,checks,preferences,date,slot='evening'){
 return person.paid&&person.enrolled&&preferences?.email!==false&&!(slot==='morning'&&preferences?.emailTiming==='evening')&&!checks.some(c=>c.signupId===person.id&&c.signupCreatedAt===person.createdAt&&c.date===date&&c.completed!==false);
}
const options={access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60};
export async function deliverEmail(payload,key){
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok){const error=new Error(data.message||'Resend rejected email');error.providerStatus=response.status;throw error;}return data.id;
}
export async function runReminders({now=new Date(),dryRun=false,previewSlot}={}){
 const schedule=await settings(),window=reminderWindow(schedule,now);
 const slot=dryRun&&['morning','evening'].includes(previewSlot)?previewSlot:(window.slot||'evening');
 if(!window.due&&!(dryRun&&window.phase==='active'))return {ok:true,skipped:'Outside the active morning/evening reminder windows.',date:window.today};
 if(!process.env.RESEND_API_KEY||!process.env.REMINDER_FROM)return {ok:false,error:'Email provider is not configured.'};
 const [people,rawChecks]=await Promise.all([getStore().adminList(),documents('checkins/'+COHORT+'/')]);const checks=rawChecks.map(c=>c.data);
 const summary={ok:true,date:window.today,slot,dryRun,eligible:0,sent:0,alreadySent:0,failed:0};
 for(const person of people){
  const prefs=await read('preferences/'+COHORT+'/'+person.id+'.json');
  if(!needsReminder(person,checks,prefs?.data,window.today,slot))continue;
  summary.eligible++;
  const {path,idempotencyKey}=reminderIdentity(window.today,person,slot);let previous=await read(path);
  if(previous?.data.status==='sent'&&previous.data.signupCreatedAt===person.createdAt){summary.alreadySent++;continue;}
  if(dryRun)continue;
  const payload=previous?.data.signupCreatedAt===person.createdAt?previous.data.payload:null;
  const record={slot,signupCreatedAt:person.createdAt,status:'pending',date:window.today,payload:payload||{from:process.env.REMINDER_FROM,to:[person.email],reply_to:process.env.REMINDER_REPLY_TO||undefined,...reminderEmail({slot})}};
  try{
   const saved=await put(path,JSON.stringify(record),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});previous={data:record,etag:saved.etag};
   // Recheck after preparing the record so a new check-in or opt-out is respected.
   const [check,currentPrefs,payment,signup]=await Promise.all([read('checkins/'+COHORT+'/'+person.id+'/'+window.today+'.json'),read('preferences/'+COHORT+'/'+person.id+'.json'),read('payments/'+person.id+'.json'),read('signups/'+person.id+'.json')]);
   if(signup?.data.createdAt!==person.createdAt||!payment?.data.paid||!payment.data.enrolled||currentPrefs?.data.email===false||(slot==='morning'&&currentPrefs?.data.emailTiming==='evening')||(check&&check.data.signupCreatedAt===person.createdAt&&check.data.completed!==false))continue;
   const emailId=await deliverEmail(record.payload,idempotencyKey);
   await put(path,JSON.stringify({...record,status:'sent',emailId,sentAt:new Date().toISOString()}),{...options,ifMatch:previous.etag});summary.sent++;
  }catch(error){if(error instanceof BlobPreconditionFailedError){summary.alreadySent++;continue;}console.error('Reminder failed:',error.name,error.providerStatus||'');summary.failed++;summary.ok=false;}
 }
 return summary;
}

export function reminderIdentity(date,person,slot){return {path:'mail/'+COHORT+'/'+date+'/'+(slot==='morning'?'morning/':'')+person.id+'.json',idempotencyKey:'wogb-reminder-'+date+'-'+(slot==='morning'?'morning-':'')+person.id+'-'+person.createdAt.replace(/[^0-9]/g,'')};}

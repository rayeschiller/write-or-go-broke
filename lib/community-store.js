import {put,BlobPreconditionFailedError} from '@vercel/blob';
import {createHash,createHmac} from 'node:crypto';
import {read,documents} from './store.js';
import {settings,AccountError} from './participant-store.js';
import {FOUNDING, paymentPath, signupPrefix, paymentPrefix} from './cohorts.js';
import {challengeState,localDate} from './challenge.js';
import {settleDay,balances,STAKE} from './ledger.js';
const options={access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60};
const publicId=id=>createHmac('sha256',process.env.PARTICIPANT_SESSION_SECRET).update('public:'+id).digest('hex').slice(0,24);
export async function context(cohort=FOUNDING){
 const [schedule,signups,payments,rawChecks]=await Promise.all([settings(cohort),documents(signupPrefix(cohort),{dataOnly:true}),documents(paymentPrefix(cohort),{dataOnly:true}),documents('checkins/'+cohort+'/',{dataOnly:true})]);
 const state=challengeState(schedule),byId=new Map(payments.map(p=>[p.id,p.data]));
 const people=signups.filter(s=>{const p=byId.get(s.id);return p?.paid&&p?.enrolled&&(cohort===FOUNDING||p.signupCreatedAt===s.data.createdAt);}).map(s=>{
  const payment=byId.get(s.id);return {id:s.id,name:s.data.name,createdAt:s.data.createdAt,eligibleFrom:schedule.startDate&&schedule.timezone?([schedule.startDate,localDate(new Date(payment.enrolledAt||s.data.createdAt),schedule.timezone)].sort().at(-1)):null};
 });
 const peopleById=new Map(people.map(p=>[p.id,p]));
 const checks=rawChecks.filter(c=>{const p=peopleById.get(c.data.signupId);return p&&p.createdAt===c.data.signupCreatedAt&&c.data.completed!==false&&state.dates.includes(c.data.date);}).map(c=>c.data);
 return {cohort,schedule,state,people,checks};
}
export async function settlement(ctx){
 const {cohort}=ctx;
 const saved=new Map((await documents('ledger/'+cohort+'/',{dataOnly:true})).map(s=>[s.data.date,s.data]));const days=[];
 for(const date of ctx.state.dates.filter(d=>d<ctx.state.today)){
  let day=saved.get(date);
  const revision=createHash('sha256').update(JSON.stringify(ctx.people.map(p=>[p.id,ctx.checks.some(c=>c.signupId===p.id&&c.date===date)]).sort())).digest('hex');
  if(!day||day.revision!==revision){
   const candidate={...settleDay(date,ctx.people,ctx.checks),cohortId:cohort,settledAt:new Date().toISOString(),version:(day?.version||0)+1,revision};const path='ledger/'+cohort+'/'+date+'.json';
   const previous=await read(path);
   try{await put(path,JSON.stringify(candidate),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});day=candidate;}
   catch(error){const existing=await read(path);if(!existing)throw error;day=existing.data;}
  }
  days.push(day);
 }
 return days;
}
export async function community(person,cohort=FOUNDING){
 const ctx=await context(cohort);if(!ctx.people.some(p=>p.id===person.id))throw new AccountError('You must be enrolled in this cohort to see its writing and scoreboard.',403);
 const [days,posts,prefs]=await Promise.all([settlement(ctx),documents('writing/'+cohort+'/',{dataOnly:true}),read('preferences/'+cohort+'/'+person.id+'.json')]);
 const records=balances(ctx.people,ctx.checks,days,ctx.state.dates,ctx.state.today);
 const byId=new Map(ctx.people.map(p=>[p.id,p]));const completed=new Set(ctx.checks.map(c=>c.signupId+':'+c.date));
 const feed=posts.filter(p=>{const owner=byId.get(p.data.signupId);return owner&&owner.createdAt===p.data.signupCreatedAt&&completed.has(p.data.signupId+':'+p.data.date)&&(p.data.shared||p.data.signupId===person.id);}).map(p=>({id:publicId(p.data.signupId)+':'+p.data.date,author:publicId(p.data.signupId),name:byId.get(p.data.signupId).name,date:p.data.date,text:p.data.text||'',photo:p.data.photoId?'/api/photo?id='+encodeURIComponent(p.data.photoId)+(cohort===FOUNDING?'':'&cohort='+cohort):null,shared:p.data.shared,updatedAt:p.data.updatedAt})).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
 return {schedule:ctx.schedule,...ctx.state,me:publicId(person.id),records:records.map(p=>({id:publicId(p.id),name:p.name,days:p.days,written:p.written,protectedCents:p.protectedCents,lostCents:p.lostCents,earnedCents:p.earnedCents,projectedCents:p.projectedCents,todayCompleted:p.todayCompleted})),posts:feed,
  unallocatedCents:days.reduce((n,d)=>n+d.unallocatedCents,0),settledDays:days.length,preferences:{emailTiming:'both',...(prefs?.data||{email:true,sms:!!person.sms})},remindersActive:cohort===FOUNDING&&!!(process.env.RESEND_API_KEY&&process.env.REMINDER_FROM&&process.env.CRON_SECRET),smsRemindersActive:false};
}
export async function saveWriting(person,date,input,cohort=FOUNDING){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AccountError('Invalid writing.');
 const text=typeof input.text==='string'?input.text.trim():'';
 if(text.length>5000||typeof input.shared!=='boolean')throw new AccountError('Writing must be 5,000 characters or fewer.');
 const photoId=input.photoId||null;
 if(photoId){
  if(!/^[a-f0-9-]{36}$/.test(photoId))throw new AccountError('Invalid photo.');
  const photo=await read('photo-metadata/'+photoId+'.json');
  if(!photo||(photo.data.cohort||FOUNDING)!==cohort||photo.data.owner!==person.id||photo.data.signupCreatedAt!==person.createdAt||photo.data.date!==date)throw new AccountError('This photo does not belong to today’s check-in.');
 }
 if(input.shared&&!text&&!photoId)throw new AccountError('Add writing or a photo, or turn off sharing.');
 const path='writing/'+cohort+'/'+person.id+'/'+date+'.json';const previous=await read(path);
 const record={signupId:person.id,signupCreatedAt:person.createdAt,date,text,photoId,shared:input.shared,updatedAt:new Date().toISOString()};
 await put(path,JSON.stringify(record),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});return record;
}
export async function savePreferences(person,data,cohort=FOUNDING){
 if(typeof data.email!=='boolean'||typeof data.sms!=='boolean'||(data.emailTiming!==undefined&&!['both','evening'].includes(data.emailTiming)))throw new AccountError('Choose your reminder preferences.');
 const path='preferences/'+cohort+'/'+person.id+'.json';const previous=await read(path);const saved={email:data.email,sms:data.sms,emailTiming:data.emailTiming||previous?.data.emailTiming||'both',consentAt:new Date().toISOString()};
 await put(path,JSON.stringify(saved),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});return saved;
}
export async function adminFinances(cohort=FOUNDING){
 const ctx=await context(cohort);const [days,payouts]=await Promise.all([settlement(ctx),documents('payouts/'+cohort+'/')]);const byId=new Map(payouts.map(p=>[p.id,p]));
 return {phase:ctx.state.phase,unallocatedCents:days.reduce((n,d)=>n+d.unallocatedCents,0),records:balances(ctx.people,ctx.checks,days,ctx.state.dates,ctx.state.today).map(p=>({...p,payout:byId.get(p.id)?.data||null,payoutVersion:byId.get(p.id)?.etag||null})),days};
}
export async function recordPayout(id,data,cohort=FOUNDING){
 const finance=await adminFinances(cohort);if(finance.phase!=='ended')throw new AccountError('Final payouts open after day 30.',422);
 if(finance.unallocatedCents)throw new AccountError('A missed-day pool has no writers. Resolve that pool before recording final payouts.',422);
 const person=finance.records.find(p=>p.id===id);if(!person)throw new AccountError('Participant not found.',404);
 if(!Number.isInteger(data.amountCents)||data.amountCents!==person.projectedCents||typeof data.sent!=='boolean')throw new AccountError('The payout amount must match the final balance.');
 const path='payouts/'+cohort+'/'+id+'.json';const previous=await read(path);
 if((previous?.etag||null)!==data.expectedVersion)throw new AccountError('Payout record changed. Refresh and try again.',409);
 const event={sent:data.sent,amountCents:data.amountCents,reference:String(data.reference||'').slice(0,100),recordedAt:new Date().toISOString()};
 const saved={signupId:id,...event,events:[...(previous?.data.events||[]),event]};
 try{const result=await put(path,JSON.stringify(saved),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});return {...saved,payoutVersion:result.etag};}
 catch(error){if(error instanceof BlobPreconditionFailedError)throw new AccountError('Payout record changed. Refresh and try again.',409);throw error;}
}

export function validateWritingEdit(person,date,state,payment,check){
 if(!payment?.paid||!payment.enrolled)throw new AccountError('Challenge enrollment required.',403);
 if(!state.dates.includes(date)||date>state.today||!check||check.completed===false||check.signupCreatedAt!==person.createdAt)throw new AccountError('You can edit writing only for a day you checked in.',403);
}
export async function editWriting(person,date,content,cohort=FOUNDING){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new AccountError('Choose a valid challenge date.');
 const [schedule,payment,check]=await Promise.all([settings(cohort),read(paymentPath(person.id,cohort)),read('checkins/'+cohort+'/'+person.id+'/'+String(date)+'.json')]);
 validateWritingEdit(person,date,challengeState(schedule),payment?.data,check?.data);
 return saveWriting(person,date,content,cohort);
}

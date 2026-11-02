import {put,BlobPreconditionFailedError} from '@vercel/blob';
import {read,documents} from './store.js';
import {settings,AccountError} from './participant-store.js';
import {COHORT,challengeState} from './challenge.js';
const options={access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60};
export async function adminCheckins(id){
 const [person,schedule,checks]=await Promise.all([read('signups/'+id+'.json'),settings(),documents('checkins/'+COHORT+'/'+id+'/')]);
 if(!person)throw new AccountError('Participant not found.',404);
 const state=challengeState(schedule);const byDate=new Map(checks.filter(c=>c.data.signupCreatedAt===person.data.createdAt).map(c=>[c.data.date,c]));
 return {name:person.data.name,dates:state.dates.map(date=>{const c=byDate.get(date);return {date,completed:!!c&&c.data.completed!==false,version:c?.etag||null,editable:date<=state.today};})};
}
export async function editCheckin(id,data){
 const [person,schedule,payment,payouts]=await Promise.all([read('signups/'+id+'.json'),settings(),read('payments/'+id+'.json'),documents('payouts/'+COHORT+'/')]);
 if(!person||!payment?.data.paid||!payment.data.enrolled)throw new AccountError('Participant must be paid and enrolled.',422);
 if(payouts.some(p=>p.data.sent))throw new AccountError('Undo recorded payouts before changing check-ins.',409);
 const state=challengeState(schedule);
 if(!state.dates.includes(data.date)||data.date>state.today||typeof data.completed!=='boolean')throw new AccountError('Choose a challenge day that has opened.');
 const reason=String(data.reason||'').trim();if(!reason||reason.length>300)throw new AccountError('Add a short reason for this correction.');
 const path='checkins/'+COHORT+'/'+id+'/'+data.date+'.json';const previous=await read(path);
 if((previous?.etag||null)!==data.expectedVersion)throw new AccountError('Check-in changed. Reload before editing.',409);
 const event={completed:data.completed,reason,at:new Date().toISOString(),actor:'admin'};
 const saved={...(previous?.data||{}),signupId:id,signupCreatedAt:person.data.createdAt,cohortId:COHORT,date:data.date,timezone:schedule.timezone,minimumMinutes:10,day:state.dates.indexOf(data.date)+1,completed:data.completed,completedAt:data.completed?(previous?.data.completedAt||event.at):null,adminEdits:[...(previous?.data.adminEdits||[]),event]};
 try{await put(path,JSON.stringify(saved),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});}
 catch(e){if(e instanceof BlobPreconditionFailedError)throw new AccountError('Check-in changed. Reload before editing.',409);throw e;}
 return adminCheckins(id);
}

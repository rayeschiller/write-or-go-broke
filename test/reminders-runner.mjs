import {mock} from 'node:test';
import assert from 'node:assert/strict';
import {FOUNDING,NEXT,NEXT_SCHEDULE,signupPath,paymentPath} from '../lib/cohorts.js';

const records=new Map(),messages=[],listed=[],written=[];
let version=0,failProvider=false,changeAfterPreparation=null,failFounding=false;
class BlobPreconditionFailedError extends Error{}
const save=(path,data)=>{const record={data,etag:String(++version)};records.set(path,record);return record;};
const person=(id,overrides={})=>({id,email:id+'@example.invalid',createdAt:'2026-10-19T00:00:00Z',paid:true,enrolled:true,...overrides});
const people=[person('returning'),person('new'),person('done'),person('optout'),person('evening'),person('unpaid',{paid:false}),person('unenrolled',{enrolled:false})];
for(const p of people){save(signupPath(p.id,NEXT),p);save(paymentPath(p.id,NEXT),{paid:p.paid,enrolled:p.enrolled});}
save('preferences/'+NEXT+'/optout.json',{email:false});
save('preferences/'+NEXT+'/evening.json',{email:true,emailTiming:'evening'});
save('checkins/'+NEXT+'/done/2026-11-24.json',{signupId:'done',signupCreatedAt:people[2].createdAt,date:'2026-11-24'});
// A founding check-in must not suppress a reminder in the new challenge.
save('checkins/'+FOUNDING+'/returning/2026-11-24.json',{signupId:'returning',signupCreatedAt:people[0].createdAt,date:'2026-11-24'});
// Old signup incarnations must not count as a current check-in.
save('checkins/'+NEXT+'/new/2026-11-24.json',{signupId:'new',signupCreatedAt:'2025-01-01T00:00:00Z',date:'2026-11-24'});
mock.module('../lib/participant-store.js',{namedExports:{settings:async cohort=>{
 assert.ok([FOUNDING,NEXT].includes(cohort),'schedule must be explicitly scoped');
 if(cohort===FOUNDING&&failFounding)throw Error('Storage unavailable');
 return cohort===NEXT?NEXT_SCHEDULE:{startDate:'2026-10-19',timezone:'America/Los_Angeles'};
}}});
mock.module('../lib/store.js',{namedExports:{
 read:async path=>records.get(path)||null,
 documents:async prefix=>[...records].filter(([path])=>path.startsWith(prefix)).map(([,record])=>record),
 getStore:()=>({adminList:async cohort=>{listed.push(cohort);return cohort===NEXT?people:[person('founder')];}}),
}});
mock.module('@vercel/blob',{namedExports:{BlobPreconditionFailedError,put:async(path,raw,options)=>{
 const previous=records.get(path);
 if((previous&&options.allowOverwrite===false)||(options.ifMatch&&previous?.etag!==options.ifMatch))throw new BlobPreconditionFailedError();
 written.push(path);const result=save(path,JSON.parse(raw));
 if(changeAfterPreparation&&result.data.status==='pending')changeAfterPreparation(path);
 return result;
}}});
globalThis.fetch=async(url,options)=>{
 assert.equal(url,'https://api.resend.com/emails');
 if(failProvider)return Response.json({message:'Temporary failure'},{status:503});
 messages.push({payload:JSON.parse(options.body),key:options.headers['Idempotency-Key']});
 return Response.json({id:'email-'+messages.length});
};
process.env.RESEND_API_KEY='test-only';process.env.REMINDER_FROM='writer@example.invalid';
const {runReminders,runCohortReminders,reminderIdentity,reminderWindow}=await import('../lib/reminders.js');
const morning=new Date('2026-11-24T17:00:00Z'),evening=new Date('2026-11-25T05:00:00Z');
const dry=await runReminders({now:morning,dryRun:true});
assert.equal(dry.ok,true);assert.equal(dry.cohorts[0].phase,'ended');assert.equal(dry.cohorts[1].eligible,2);
assert.equal(messages.length,0);assert.equal(written.length,0);
const first=await runReminders({now:morning});
assert.equal(first.cohorts[1].sent,2);assert.deepEqual(new Set(listed),new Set([NEXT]));
assert.deepEqual(messages.map(m=>m.payload.to[0]),['returning@example.invalid','new@example.invalid']);
for(const {payload,key} of messages){
 assert.match(payload.text,/https:\/\/write\.rayeschiller\.com\/challenge\?cohort=november-2026/);
 assert.match(payload.html,/href="https:\/\/write\.rayeschiller\.com\/cohort\?cohort=november-2026"/);
 assert.ok(key.includes(NEXT));
}
assert.ok(written.every(path=>path.startsWith('mail/'+NEXT+'/')));
assert.equal((await runReminders({now:morning})).cohorts[1].alreadySent,2);assert.equal(messages.length,2);
assert.equal((await runReminders({now:evening})).cohorts[1].sent,3);assert.equal(messages.length,5);
// Original identities remain stable; the same returning signup cannot collide across cohorts.
const old=reminderIdentity('2026-11-24',people[0],'evening');
assert.equal(old.path,'mail/founding-cohort/2026-11-24/returning.json');
assert.equal(old.idempotencyKey,'wogb-reminder-2026-11-24-returning-20261019000000');
assert.notEqual(old.idempotencyKey,reminderIdentity('2026-11-24',people[0],'evening',NEXT).idempotencyKey);
// A check-in or opt-out during execution still suppresses delivery.
changeAfterPreparation=path=>{
 if(path.endsWith('/returning.json'))save('checkins/'+NEXT+'/returning/2026-11-25.json',{signupCreatedAt:people[0].createdAt,completed:true});
 if(path.endsWith('/new.json'))save('preferences/'+NEXT+'/new.json',{email:false});
};
const changed=await runCohortReminders({cohort:NEXT,now:new Date('2026-11-25T17:00:00Z')});
assert.equal(changed.sent,1);assert.equal(messages.at(-1).payload.to[0],'done@example.invalid');
changeAfterPreparation=null;
// Failed delivery remains retryable with the same identity; dry runs never send.
failProvider=true;
const failed=await runCohortReminders({cohort:NEXT,now:new Date('2026-11-26T17:00:00Z')});
assert.equal(failed.ok,false);assert.ok(failed.failed>0);
failProvider=false;
const retried=await runCohortReminders({cohort:NEXT,now:new Date('2026-11-26T17:00:00Z')});
assert.equal(retried.sent,failed.failed);
// One cohort failing must not prevent the other from being processed.
failFounding=true;
const partial=await runReminders({now:morning,dryRun:true});assert.equal(partial.ok,false);assert.equal(partial.cohorts[1].ok,true);
assert.equal(reminderWindow(NEXT_SCHEDULE,new Date('2026-11-21T17:00:00Z')).due,false);
assert.equal(reminderWindow(NEXT_SCHEDULE,new Date('2026-12-22T17:00:00Z')).due,false);
assert.equal(reminderWindow(NEXT_SCHEDULE,new Date('2026-11-24T18:00:00Z')).due,false);
assert.equal(reminderWindow({startDate:'2026-10-19',timezone:'America/Los_Angeles'},new Date('2026-10-20T16:00:00Z')).slot,'morning');

// Historical founding jobs still use the original records and links.
failFounding=false;
const founder=person('founder');save(signupPath(founder.id),founder);save(paymentPath(founder.id),{paid:true,enrolled:true});
const historical=await runReminders({now:new Date('2026-10-20T16:00:00Z')});
assert.equal(historical.cohorts[0].sent,1);assert.equal(historical.cohorts[1].phase,'upcoming');
assert.equal(messages.at(-1).payload.to[0],'founder@example.invalid');
assert.match(messages.at(-1).payload.html,/href="https:\/\/write\.rayeschiller\.com\/challenge"/);

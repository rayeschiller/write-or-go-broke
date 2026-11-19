import {mock} from 'node:test';
import assert from 'node:assert/strict';
const db=new Map();let version=0;
class BlobPreconditionFailedError extends Error{}
class BlobNotFoundError extends Error{}
function save(path,data){const r={data,etag:'v'+(++version)};db.set(path,r);return r;}
mock.module('@vercel/blob',{namedExports:{
 BlobPreconditionFailedError,BlobNotFoundError,
 get:async path=>{const r=db.get(path);return r?{statusCode:200,blob:{etag:r.etag},stream:new Blob([JSON.stringify(r.data)]).stream()}:null;},
 head:async path=>db.get(path),
 put:async(path,raw,opts)=>{const r=db.get(path);if((opts.ifMatch&&r?.etag!==opts.ifMatch)||(opts.allowOverwrite===false&&r))throw new BlobPreconditionFailedError();return save(path,JSON.parse(raw));},
 del:async()=>{throw Error('No deletion expected');},
 list:async({prefix})=>({blobs:[...db.keys()].filter(k=>k.startsWith(prefix)).map(path=>({url:path,pathname:path})),hasMore:false})
}});
process.env.PARTICIPANT_SESSION_SECRET='local-test-only';
const {getStore}=await import('../lib/store.js');
const {recordPayout,adminFinances}=await import('../lib/community-store.js');
const {nextStatus,rolloverQuote}=await import('../lib/next-cohort.js');
const {FOUNDING,NEXT,paymentPath,signupPath}=await import('../lib/cohorts.js');
const {addDays}=await import('../lib/challenge.js');
const id='a'.repeat(64),createdAt='2026-10-19T00:00:00Z';
const person={id,name:'Fixture Comic',email:'fixture@example.invalid',createdAt,accountCohort:FOUNDING};
save('challenge/'+FOUNDING+'.json',{startDate:'2026-10-19',timezone:'America/Los_Angeles'});
save(signupPath(id),person);
save(paymentPath(id),{paid:true,enrolled:true,enrolledAt:createdAt});
save('accounts/'+id+'.json',{passwordHash:'unchanged',passwordSalt:'unchanged',signupCreatedAt:createdAt});
for(let i=0;i<30;i++){const date=addDays('2026-10-19',i);save('checkins/'+FOUNDING+'/'+id+'/'+date+'.json',{signupId:id,signupCreatedAt:createdAt,date,completed:true});}
save(signupPath(id,NEXT),{...person,source:'returning',rollover:true,createdAt:'2026-11-17T00:00:00Z',foundingSignupCreatedAt:createdAt});
const before=structuredClone([...db].filter(([k])=>k.startsWith('accounts/')||k.startsWith('checkins/')||k===paymentPath(id)));
const receipt=await recordPayout(id,{sent:true,amountCents:15000,expectedVersion:null});
assert.equal(receipt.sent,true);
assert.equal((await nextStatus(person)).rollover,false);
assert.equal((await rolloverQuote(person)).owedCents,15000);
await assert.rejects(getStore().setPayment(id,true,null,NEXT,'rollover',15000),/paid back/);
const fresh=await getStore().setPayment(id,true,null,NEXT,'venmo');
const enrolled=await getStore().setEnrollment(id,true,fresh.paymentVersion,NEXT);
assert.equal(enrolled.enrolled,true);
assert.equal((await nextStatus(person)).enrolled,true);
assert.deepEqual([...db].filter(([k])=>k.startsWith('accounts/')||k.startsWith('checkins/')||k===paymentPath(id)),before);
await assert.rejects(recordPayout(id,{sent:false,amountCents:15000,expectedVersion:null}),/changed/);
await recordPayout(id,{sent:false,amountCents:15000,expectedVersion:receipt.payoutVersion});
const rolled=await getStore().setPayment(id,true,enrolled.paymentVersion,NEXT,'rollover',15000);
assert.equal(rolled.method,'rollover');
const finance=await adminFinances();
await assert.rejects(recordPayout(id,{sent:true,amountCents:15000,expectedVersion:finance.records[0].payoutVersion}),/already funding/);
console.log('PASS: real store payout → blocked rollover → fresh payment → enrollment; history intact; stale writes and duplicate funding rejected.');

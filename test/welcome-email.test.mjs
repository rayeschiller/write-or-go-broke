import test from 'node:test';
import assert from 'node:assert/strict';
import {createWelcomeSender} from '../lib/welcome-flow.js';
import {welcomeEmail} from '../lib/welcome-email.js';
import {FOUNDING,NEXT,signupPath,paymentPath} from '../lib/cohorts.js';
const id='a'.repeat(64),createdAt='2026-11-18T12:00:00Z';
function fixture({paid=true,enrolled=true,cohort=FOUNDING}={}){
 let time=Date.parse('2026-11-19T02:00:00Z'),version=0,prepareCalls=0,accepted=0,failSentSave=false,failBeforeSend=false;
 const records=new Map(),delivered=new Map(),attempts=[];
 const signup={name:'Test <Comic>',email:'comic@example.invalid',createdAt};
 const read=async path=>structuredClone(records.get(path)||null);
 const write=async(path,data,previous)=>{
  const current=records.get(path);
  if((current?.etag||null)!==(previous?.etag||null))throw Error('Version conflict');
  if(data.status==='sent'&&failSentSave){failSentSave=false;throw Error('Receipt write interrupted');}
  const result={data:structuredClone(data),etag:String(++version)};records.set(path,result);return structuredClone(result);
 };
 records.set(signupPath(id,cohort),{data:signup,etag:String(++version)});
 records.set(paymentPath(id,cohort),{data:{paid,enrolled,signupCreatedAt:createdAt},etag:String(++version)});
 const prepareLink=async args=>{prepareCalls++;return {setup:true,url:'https://write.rayeschiller.com/challenge#setup='+args.id+'&token='+args.access};};
 const deliver=async(payload,key)=>{
  attempts.push({payload:structuredClone(payload),key});
  if(failBeforeSend){failBeforeSend=false;throw Error('Provider unavailable');}
  if(delivered.has(key)){assert.deepEqual(payload,delivered.get(key).payload);return delivered.get(key).id;}
  const message={id:'email-'+(++accepted),payload:structuredClone(payload)};delivered.set(key,message);return message.id;
 };
 const settings={enabled:true,from:'Test <sender@example.invalid>',replyTo:'reply@example.invalid',origin:'https://write.rayeschiller.com'};
 const send=createWelcomeSender({read,write,prepareLink,deliver,config:()=>settings,now:()=>time});
 return {send:()=>send(id,cohort),records,attempts,settings,get accepted(){return accepted;},get prepareCalls(){return prepareCalls;},advance:ms=>{time+=ms;},failReceipt:()=>{failSentSave=true;},failProvider:()=>{failBeforeSend=true;}};
}
test('welcome only sends for paid and enrolled writers',async()=>{
 for(const flags of [{paid:false,enrolled:false},{paid:true,enrolled:false},{paid:false,enrolled:true}]){
  const f=fixture(flags);assert.equal((await f.send()).status,'skipped');assert.equal(f.accepted,0);assert.equal(f.prepareCalls,0);
 }
});
test('sends a private setup link once and keeps a receipt without token or payload',async()=>{
 const f=fixture({cohort:NEXT});assert.equal((await f.send()).status,'sent');
 const payload=f.attempts[0].payload;assert.equal(payload.subject,'Welcome to the cohort');assert.deepEqual(payload.to,['comic@example.invalid']);assert.match(payload.text,/#setup=/);assert.match(payload.html,/Test &lt;Comic&gt;/);
 const receipt=[...f.records.entries()].find(([path])=>path.startsWith('welcome/'))[1].data;
 assert.equal(receipt.status,'sent');assert.equal(receipt.access,undefined);assert.equal(receipt.payload,undefined);
 f.advance(7*86400000);assert.equal((await f.send()).status,'already_sent');assert.equal(f.accepted,1);assert.equal(f.prepareCalls,1);
});
test('concurrent enrollment requests do not generate multiple links or emails',async()=>{
 const f=fixture();const results=await Promise.all([f.send(),f.send(),f.send()]);
 assert.equal(results.filter(r=>r.status==='sent').length,1);assert.equal(f.accepted,1);assert.equal(f.prepareCalls,1);
});
test('retries retain exact payload and provider key after an interrupted receipt write',async()=>{
 const f=fixture();f.failReceipt();assert.equal((await f.send()).status,'failed');
 assert.equal((await f.send()).status,'sent');assert.equal(f.accepted,1);assert.equal(f.prepareCalls,1);
 assert.deepEqual(f.attempts[0],f.attempts[1]);
});
test('provider failure can be retried without rotating the setup link',async()=>{
 const f=fixture();f.failProvider();assert.equal((await f.send()).status,'failed');assert.equal((await f.send()).status,'sent');assert.equal(f.prepareCalls,1);assert.equal(f.accepted,1);
});
test('does not risk duplicate delivery after the provider deduplication window',async()=>{
 const f=fixture();f.failReceipt();await f.send();f.advance(24*3600000);
 assert.equal((await f.send()).status,'review');assert.equal(f.attempts.length,1);
});
test('missing provider configuration leaves enrollment intact',async()=>{
 const f=fixture();f.settings.enabled=false;assert.equal((await f.send()).status,'failed');assert.equal(f.prepareCalls,0);assert.equal(f.records.get(paymentPath(id)).data.enrolled,true);
});
test('November welcome requires the payment to match this signup',async()=>{
 const f=fixture({cohort:NEXT});f.records.get(paymentPath(id,NEXT)).data.signupCreatedAt='old';assert.equal((await f.send()).status,'skipped');
});
test('returning-writer email uses existing login without password-reset copy',()=>{
 const email=welcomeEmail({name:'Alex',url:'https://write.rayeschiller.com/challenge?cohort=november-2026',setup:false});assert.match(email.text,/existing email and password/);assert.doesNotMatch(email.text,/expires|#setup|set up your password/);
});

import {createWelcomeLinkPreparer} from '../lib/welcome-link.js';
import {digest} from '../lib/participant-auth.js';
import {sendWelcomeForRequest} from '../lib/welcome.js';
function linkFixture(account,founding){
 const writes=[];
 const read=async path=>path.startsWith('accounts/')?account?{data:account,etag:'current'}:null:founding?{data:founding,etag:'founding'}:null;
 const write=async(path,data,previous)=>{writes.push({path,data,previous});account=data;};
 const prepare=createWelcomeLinkPreparer({read,write,now:()=>Date.parse('2026-11-19T02:00:00Z')});
 const args={id,cohort:NEXT,signup:{createdAt},access:'private-test-token',expiresAt:'2026-11-22T02:00:00Z',origin:'https://write.rayeschiller.com'};
 return {prepare,args,writes};
}
test('new-writer setup uses a one-use hashed invitation and reuses it on recovery',async()=>{
 const f=linkFixture();const link=await f.prepare(f.args);assert.equal(link.setup,true);assert.match(link.url,/\?cohort=november-2026#setup=/);
 assert.equal(f.writes[0].data.inviteHash,digest(f.args.access));assert.equal(f.writes[0].data.inviteCohort,NEXT);assert.equal(f.writes[0].data.inviteSignupCreatedAt,createdAt);
 await f.prepare(f.args);assert.equal(f.writes.length,1);
});
test('welcome does not alter an existing password or auth version',async()=>{
 const f=linkFixture({passwordHash:'existing-password-hash',salt:'existing-salt',authVersion:'existing-version',signupCreatedAt:createdAt});
 const link=await f.prepare(f.args);assert.equal(link.setup,false);assert.doesNotMatch(link.url,/#setup/);assert.equal(f.writes.length,0);
});
test('returning writer keeps their founding account and receives the next-cohort login',async()=>{
 const foundingDate='2026-10-19T00:00:00Z';const f=linkFixture({passwordHash:'existing',signupCreatedAt:foundingDate},{createdAt:foundingDate});
 f.args.signup={createdAt,source:'returning',foundingSignupCreatedAt:foundingDate};
 assert.deepEqual(await f.prepare(f.args),{url:'https://write.rayeschiller.com/challenge?cohort=november-2026',setup:false});assert.equal(f.writes.length,0);
});
test('returning setup invitation targets the founding account if no password exists',async()=>{
 const foundingDate='2026-10-19T00:00:00Z';const f=linkFixture(null,{createdAt:foundingDate});
 f.args.signup={createdAt,source:'returning',foundingSignupCreatedAt:foundingDate};await f.prepare(f.args);
 assert.equal(f.writes[0].data.inviteCohort,FOUNDING);assert.equal(f.writes[0].data.inviteSignupCreatedAt,foundingDate);
});
test('stale returning linkage cannot create an invitation',async()=>{
 const f=linkFixture(null,{createdAt:'different'});f.args.signup={createdAt,source:'returning',foundingSignupCreatedAt:'original'};
 await assert.rejects(f.prepare(f.args),/linkage/);assert.equal(f.writes.length,0);
});
test('staging does not send real welcome emails',async()=>{
 const result=await sendWelcomeForRequest({headers:{host:'write-or-go-broke-staging.vercel.app'}},id,NEXT);assert.equal(result.status,'skipped');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {fundingQuote, assertPayoutAvailable, assertRolloverAvailable, createFundingLock, FundingConflict} from '../lib/funding.js';

const createdAt='2026-10-19T00:00:00Z';
const signup={createdAt:'2026-11-17T00:00:00Z',foundingSignupCreatedAt:createdAt};
const paid={signupCreatedAt:signup.createdAt,paid:true,method:'rollover'};
test('a returned balance preserves historical earnings but requires a fresh full stake',()=>{
  for(const amountCents of [14499,14503,16170]){
    const quote=fundingQuote(amountCents,{sent:true,amountCents,signupCreatedAt:createdAt},createdAt);
    assert.equal(quote.balanceCents,amountCents);
    assert.equal(quote.availableCents,0);
    assert.equal(quote.rolloverCents,0);
    assert.equal(quote.owedCents,15000);
    assert.equal(quote.payoutCents,0);
    assert.equal(quote.paidBack,true);
  }
});
test('undoing a payout restores available credit; another signup’s payout does not consume it',()=>{
  for(const payout of [null,{sent:false},{sent:true,signupCreatedAt:'old-account'}]){
    const quote=fundingQuote(14503,payout,createdAt);
    assert.equal(quote.rolloverCents,14503);assert.equal(quote.owedCents,497);
    assert.doesNotThrow(()=>assertRolloverAvailable(payout,createdAt));
  }
});
test('both legacy and current paid-back records prevent rollover',()=>{
  assert.throws(()=>assertRolloverAvailable({sent:true},createdAt),FundingConflict);
  assert.throws(()=>assertRolloverAvailable({sent:true,signupCreatedAt:createdAt},createdAt),FundingConflict);
});
test('full payout is blocked only when the matching balance already funds the next round',()=>{
  assert.throws(()=>assertPayoutAvailable(createdAt,signup,paid),FundingConflict);
  for(const payment of [null,{...paid,paid:false},{...paid,method:'venmo'},{...paid,signupCreatedAt:'old'}])assert.doesNotThrow(()=>assertPayoutAvailable(createdAt,signup,payment));
  assert.doesNotThrow(()=>assertPayoutAvailable('other-account',signup,paid));
});
function memoryLock(){
  const records=new Map();let version=0,clock=0;
  const read=async path=>structuredClone(records.get(path)||null);
  const write=async(path,data,etag)=>{if((records.get(path)?.etag??null)!==etag)throw Error('Conflict');const saved={data,etag:String(++version)};records.set(path,saved);return saved;};
  return {lock:createFundingLock({read,write,now:()=>clock}),advance:()=>clock+=120001};
}
test('simultaneous payout and rollover cannot both write; next attempt observes the payout',async()=>{
  const {lock}=memoryLock();let payout=null,entered;
  const acquired=new Promise(resolve=>entered=resolve);let release;
  const hold=new Promise(resolve=>release=resolve);
  const sending=lock('writer',async()=>{entered();await hold;payout={sent:true};});
  await acquired;
  await assert.rejects(lock('writer',async()=>assert.fail('must not enter')),FundingConflict);
  release();await sending;
  await assert.rejects(lock('writer',async()=>assertRolloverAvailable(payout,createdAt)),FundingConflict);
});
test('failed operations release the lease; different writers do not block each other',async()=>{
  const {lock}=memoryLock();
  await assert.rejects(lock('writer',async()=>{throw Error('Storage error');}),/Storage error/);
  assert.equal(await lock('writer',async()=>lock('other',async()=>42)),42);
});
test('two requests racing to acquire an empty lease admit exactly one operation',async()=>{
  const {lock}=memoryLock();let entered=0;
  const results=await Promise.allSettled([lock('writer',async()=>++entered),lock('writer',async()=>++entered)]);
  assert.equal(entered,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
});

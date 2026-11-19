import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSocialProfile} from '../public/social-profile.js';
import {handle} from '../lib/handler.js';

test('accepts profile links with optional scheme and strips sharing parameters',()=>{
  for(const [input,expected] of [
    [' instagram.com/comic.name?igsh=tracking ', 'https://www.instagram.com/comic.name/'],
    ['https://WWW.INSTAGRAM.COM/comic_name/', 'https://www.instagram.com/comic_name/'],
    ['tiktok.com/@comic_name?lang=en', 'https://www.tiktok.com/@comic_name'],
    ['http://www.tiktok.com/@comic.name/', 'https://www.tiktok.com/@comic.name']
  ])assert.equal(normalizeSocialProfile(input),expected);
});
test('rejects absent values, other sites, spoofed hosts, and non-profile URLs',()=>{
  for(const input of [undefined,null,{},'', '@comic','https://example.com/comic',
    'https://instagram.com.evil.example/comic','https://instagram.com@evil.example/comic',
    'https://user:secret@instagram.com/comic','https://instagram.com:8080/comic',
    'javascript:alert(1)','https://instagram.com/','https://instagram.com/p/123',
    'https://instagram.com/reels/','https://instagram.com/accounts/',
    'https://instagram.com/a..b/','https://instagram.com/comic/extra',
    'https://tiktok.com/@comic/video/123','https://vm.tiktok.com/abc/',
    'https://tiktok.com/comic','https://tiktok.com/@comic name',
    'https://instagram.com/comic\\other','a'.repeat(501)
  ])assert.equal(normalizeSocialProfile(input),null,String(input));
});
const base={name:'Test Comic',email:'comic@example.invalid',phone:'2025550100',consent:true,sms:false};
async function request(body,action='signup'){
  let added,removed,storageCalls=0;
  const storage=()=>{storageCalls++;return {allowRequest:async()=>true,add:async person=>{added=person;},remove:async(...args)=>{removed=args;}};};
  const result={};const res={setHeader(){},status(value){result.status=value;return this;},json(value){result.body=value;return this;}};
  await handle({method:'POST',headers:{host:'example.invalid',origin:'https://example.invalid','content-type':'application/json'},body},res,action,storage);
  return {...result,added,removed,storageCalls};
}
test('API requires a valid profile before accessing storage, for either cohort',async()=>{
  for(const cohort of [undefined,'november-2026'])for(const socialProfile of [undefined,'','https://example.com/me','https://instagram.com/p/example']){
    const result=await request({...base,cohort,socialProfile});
    assert.equal(result.status,400);assert.match(result.body.error,/Instagram or TikTok/);assert.equal(result.storageCalls,0);
  }
});
test('API passes canonical profile to signup storage',async()=>{
  const result=await request({...base,socialProfile:'tiktok.com/@comic?share=abc'});
  assert.equal(result.status,200);assert.equal(result.added.socialProfile,'https://www.tiktok.com/@comic');
  assert.equal(result.added.phone,'+12025550100');assert.equal(result.added.email,base.email);
});
test('existing signup removal does not require a social profile',async()=>{
  const result=await request({email:base.email,phone:base.phone},'remove');
  assert.equal(result.status,200);assert.deepEqual(result.removed,[base.email,'+12025550100']);
});

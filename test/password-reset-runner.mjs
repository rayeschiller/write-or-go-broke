import {mock} from 'node:test';
import assert from 'node:assert/strict';

const records=new Map();
const background=[];
const messages=[];
let version=0;
class BlobPreconditionFailedError extends Error{}
class BlobNotFoundError extends Error{}
function save(path,data){
  const result={data,etag:String(++version)};
  records.set(path,result);
  return result;
}
mock.module('@vercel/blob',{namedExports:{
  BlobPreconditionFailedError,BlobNotFoundError,
  head:async()=>{throw Error("Unexpected Blob head");},
  del:async()=>{throw Error("Unexpected Blob deletion");},
  list:async()=>{throw Error("Unexpected Blob listing");},
  get:async path=>{
    const entry=records.get(path);
    return entry?{statusCode:200,blob:{etag:entry.etag},stream:new Blob([JSON.stringify(entry.data)]).stream()}:null;
  },
  put:async(path,raw,options)=>{
    const current=records.get(path);
    if((options.ifMatch&&current?.etag!==options.ifMatch)||(current&&options.allowOverwrite===false)){
      throw new BlobPreconditionFailedError();
    }
    return save(path,JSON.parse(raw));
  },
}});
mock.module('@vercel/functions',{namedExports:{waitUntil:promise=>background.push(promise)}});
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');
  messages.push(JSON.parse(options.body));
  return Response.json({id:'mock-email'});
};
process.env.PARTICIPANT_SESSION_SECRET='test-secret';
process.env.RESEND_API_KEY='test-email-key';
process.env.REMINDER_FROM='Writing <writing@example.invalid>';
process.env.VERCEL_ENV='production';

const {default:handler}=await import('../api/participant.js');
const {digest,passwordRecord,verifyPassword}=await import('../lib/participant-auth.js');
const {validateIdentity}=await import('../lib/participant-store.js');
const {NEXT,signupPath}=await import('../lib/cohorts.js');
const email='writer@example.invalid';
const id=digest(email);
const accountPath='accounts/'+id+'.json';
const signup={email,createdAt:'2026-10-19T00:00:00Z'};
save(signupPath(id),signup);
save(signupPath(id,NEXT),{...signup,source:'returning'});
save(accountPath,{...await passwordRecord('initial password'),signupCreatedAt:signup.createdAt,authVersion:'old-session'});

async function post(body,host='write.rayeschiller.com'){
  const headers={host,origin:'https://'+host,'content-type':'application/json'};
  const result={headers:{}};
  await handler({method:'POST',url:'/api/participant?cohort='+NEXT,headers,body},{
    setHeader(name,value){result.headers[name]=value;},
    status(code){result.status=code;return this;},
    json(value){result.body=value;},
  });
  return result;
}
const request=email=>post({action:'request-password-reset',email});
const [known,duplicate,unknown]=await Promise.all([request(email),request(email),request('nobody@example.invalid')]);
assert.equal(known.status,202);
assert.deepEqual(known,unknown);
assert.deepEqual(known,duplicate);
assert.equal(known.headers['Set-Cookie'],undefined);
await Promise.all(background);
assert.deepEqual(messages.map(message=>message.to),[[email]]);
const resetUrl=new URL(messages[0].text.match(/https:\/\/[^\s]+/)[0]);
assert.equal(resetUrl.origin,'https://write.rayeschiller.com');
assert.equal(resetUrl.searchParams.get('cohort'),NEXT);
const fragment=new URLSearchParams(resetUrl.hash.slice(1));
const token=fragment.get('token');
assert.equal(fragment.get('reset'),id);
assert.equal(records.get(accountPath).data.resetHash,digest(token));
assert.equal(JSON.stringify(records.get(accountPath)).includes(token),false);
const reset={action:'reset-password',id,token,password:'replacement password'};
const saved=records.get(accountPath).data;
save(accountPath,{...saved,resetExpiresAt:'2020-01-01T00:00:00Z'});
assert.equal((await post(reset)).status,401);
save(accountPath,saved);
const results=await Promise.all([post(reset),post(reset)]);
assert.equal(results.filter(result=>result.status===200).length,1);
assert.equal(results.filter(result=>result.status===409||result.status===401).length,1);
assert.match(results.find(result=>result.status===200).headers['Set-Cookie'],/HttpOnly/);
assert.equal((await post(reset)).status,401);
assert.equal(await validateIdentity({id,version:'old-session'}),null);
assert.equal(await verifyPassword('replacement password',records.get(accountPath).data),true);
assert.equal((await post({action:'request-password-reset',email},'preview.example.invalid')).status,503);
assert.equal(messages.length,1);

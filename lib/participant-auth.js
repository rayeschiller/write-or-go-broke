import {createHash,createHmac,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
const COOKIE='__Host-wogb_participant';const AGE=30*86400;
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const secret=()=>process.env.PARTICIPANT_SESSION_SECRET;
export const token=()=>randomBytes(32).toString('base64url');
export function normalizeIdentifier(value){
  if(typeof value!=='string' || value.length>254)return null;
  value=value.trim();
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return {type:'email',value:value.toLowerCase()};
  if(!/^\+?[\d\s().-]+$/.test(value))return null;
  let digits=value.replace(/\D/g,'');if(digits.length===11&&digits[0]==='1')digits=digits.slice(1);
  return /^[2-9]\d{9}$/.test(digits)?{type:'phone',value:'+1'+digits}:null;
}
export function validPassword(value){return typeof value==='string'&&value.length>=10&&value.length<=128;}
export async function passwordRecord(password){
  const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  return {salt,passwordHash:hash.toString('hex')};
}
export async function verifyPassword(password,account){
  const salt=account?.salt||'not-a-real-account';
  const hash=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  const expected=account?.passwordHash&&/^[a-f0-9]{128}$/.test(account.passwordHash)?Buffer.from(account.passwordHash,'hex'):Buffer.alloc(64);
  return timingSafeEqual(hash,expected)&&!!account?.passwordHash;
}
const sign=payload=>createHmac('sha256',secret()).update(payload).digest('base64url');
export function issueParticipant(id,version){const payload=Buffer.from(JSON.stringify({id,version,exp:Math.floor(Date.now()/1000)+AGE})).toString('base64url');return payload+'.'+sign(payload);}
export function participantCookie(value){return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${value?AGE:0}`;}
export function participantIdentity(req){
  if(!secret())return null;
  const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
  if(!cookie || cookie.length>1500)return null;
  const [payload,signature,...rest]=cookie.slice(COOKIE.length+1).split('.');
  if(!payload||!signature||rest.length||!timingSafeEqual(Buffer.from(digest(signature),'hex'),Buffer.from(digest(sign(payload)),'hex')))return null;
  try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());return /^[a-f0-9]{64}$/.test(data.id)&&typeof data.version==='string'&&Number.isInteger(data.exp)&&data.exp>Math.floor(Date.now()/1000)&&data.exp<=Math.floor(Date.now()/1000)+AGE?data:null;}catch{return null;}
}

import {createHmac,createHash,timingSafeEqual,randomBytes} from 'node:crypto';
const COOKIE='__Host-wogb_admin';
const MAX_AGE=7*24*60*60;
const hash=value=>createHash('sha256').update(String(value)).digest();
const same=(a,b)=>timingSafeEqual(hash(a),hash(b));
export function validAccessKey(value){
  return typeof process.env.ADMIN_ACCESS_KEY==='string' && process.env.ADMIN_ACCESS_KEY.length>=32 && typeof value==='string' && same(value,process.env.ADMIN_ACCESS_KEY);
}
const sign=value=>createHmac('sha256',process.env.ADMIN_ACCESS_KEY).update(value).digest('base64url');
export function issueSession(){
  const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+MAX_AGE,nonce:randomBytes(16).toString('base64url')})).toString('base64url');
  return payload+'.'+sign(payload);
}
export function authenticated(req){
  if(!process.env.ADMIN_ACCESS_KEY)return false;
  const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
  if(!cookie)return false;
  const token=cookie.slice(COOKIE.length+1);if(token.length>1024)return false;
  const [payload,signature,...rest]=token.split('.');
  if(!payload || !signature || rest.length || !same(signature,sign(payload)))return false;
  try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());return Number.isInteger(data.exp) && data.exp>Math.floor(Date.now()/1000) && data.exp<=Math.floor(Date.now()/1000)+MAX_AGE;}
  catch{return false;}
}
export function sessionCookie(token){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${token?MAX_AGE:0}`;}
export function sameOrigin(req){
  try{return !!req.headers.origin && new URL(req.headers.origin).protocol==='https:' && new URL(req.headers.origin).host===req.headers.host;}
  catch{return false;}
}
export function json(res,status,data){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');res.setHeader('X-Robots-Tag','noindex, nofollow');
  return res.status(status).json(data);
}
export function body(req){
  if(!req.headers['content-type']?.startsWith('application/json'))throw Error('JSON required');
  if(Number(req.headers['content-length']||0)>8192)throw Error('Request too large');
  const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!data || typeof data!=='object' || Array.isArray(data) || Buffer.byteLength(JSON.stringify(data))>8192)throw Error('Invalid request');
  return data;
}

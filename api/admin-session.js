import {authenticated,validAccessKey,issueSession,sessionCookie,sameOrigin,json,body} from '../lib/admin-auth.js';
import {getStore} from '../lib/store.js';
export default async function handler(req,res){
  if(req.method==='GET')return json(res,authenticated(req)?200:401,{authenticated:authenticated(req)});
  if(!['POST','DELETE'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
  if(!sameOrigin(req))return json(res,403,{error:'Please use this website to sign in.'});
  if(req.method==='DELETE'){res.setHeader('Set-Cookie',sessionCookie(''));return json(res,200,{ok:true});}
  if(!process.env.ADMIN_ACCESS_KEY)return json(res,503,{error:'Admin access is not configured.'});
  let data;try{data=body(req);}catch{return json(res,400,{error:'Invalid request.'});}
  try{
    const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'anonymous').split(',')[0].trim();
    if(!await getStore().allowRequest('admin-login:'+ip))return json(res,429,{error:'Too many sign-in attempts. Try again in 10 minutes.'});
    if(!validAccessKey(data.key))return json(res,401,{error:'That admin access key is not valid.'});
    res.setHeader('Set-Cookie',sessionCookie(issueSession()));return json(res,200,{ok:true});
  }catch(error){console.error('Admin sign-in failed:',error.name);return json(res,503,{error:'Sign-in is temporarily unavailable. Try again.'});}
}

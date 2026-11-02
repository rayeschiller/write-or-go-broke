import {get,put} from '@vercel/blob';
import {randomUUID} from 'node:crypto';
import {participantIdentity} from '../lib/participant-auth.js';
import {validateIdentity,settings,allowAttempt} from '../lib/participant-store.js';
import {read} from '../lib/store.js';
import {challengeState,COHORT} from '../lib/challenge.js';
import {sameOrigin,json} from '../lib/admin-auth.js';
export default async function handler(req,res){
 try{
  const person=await validateIdentity(participantIdentity(req));if(!person)return json(res,401,{error:'Please log in.'});
  const payment=await read('payments/'+person.id+'.json');if(!payment?.data.paid||!payment?.data.enrolled)return json(res,403,{error:'Challenge enrollment required.'});
  if(req.method==='GET'){
   const id=new URL(req.url,'https://'+req.headers.host).searchParams.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))return json(res,404,{error:'Photo not found.'});
   const meta=await read('photo-metadata/'+id+'.json');if(!meta)return json(res,404,{error:'Photo not found.'});
   const photo=meta.data;const owner=await read('signups/'+photo.owner+'.json');
   if(!owner||owner.data.createdAt!==photo.signupCreatedAt)return json(res,404,{error:'Photo not found.'});
   if(photo.owner!==person.id){
    const writing=await read('writing/'+COHORT+'/'+photo.owner+'/'+photo.date+'.json');const check=await read('checkins/'+COHORT+'/'+photo.owner+'/'+photo.date+'.json');
    if(!writing?.data.shared||writing.data.photoId!==id||!check||check.data.completed===false||check.data.signupCreatedAt!==photo.signupCreatedAt)return json(res,404,{error:'Photo not found.'});
   }
   const saved=await get(photo.url,{access:'private',useCache:false});if(saved?.statusCode!==200)return json(res,404,{error:'Photo not found.'});
   res.setHeader('Content-Type',photo.type);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition','inline');
   return res.status(200).send(Buffer.from(await new Response(saved.stream).arrayBuffer()));
  }
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
  if(!sameOrigin(req))return json(res,403,{error:'Please upload from this website.'});

  if(!await allowAttempt('photo-upload',req))return json(res,429,{error:'Too many uploads. Try again in 10 minutes.'});
  if(!req.headers['content-type']?.startsWith('application/json')||Number(req.headers['content-length']||0)>3600000)return json(res,413,{error:'Photo is too large.'});
  let data;try{data=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return json(res,400,{error:'Invalid photo.'});}
  const state=challengeState(await settings()),date=data?.date||state.today;
  if(typeof date!=='string'||!state.dates.includes(date)||date>state.today)return json(res,403,{error:'Choose an open challenge day.'});
  if(data?.date){const check=await read('checkins/'+COHORT+'/'+person.id+'/'+date+'.json');if(!check||check.data.completed===false||check.data.signupCreatedAt!==person.createdAt)return json(res,403,{error:'Check in before editing this day’s photo.'});}
  else if(state.phase!=='active')return json(res,403,{error:'The challenge is not active.'});
  const match=typeof data?.image==='string'&&data.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!match||match[2].length>3500000)return json(res,400,{error:'Use a JPG, PNG or WebP photo up to 2.5 MB.'});
  const bytes=Buffer.from(match[2],'base64');if(bytes.length>2500000||bytes.length<12)return json(res,413,{error:'Photo is too large or invalid.'});
  const valid=match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid)return json(res,400,{error:'Invalid image file.'});
  const id=randomUUID(),type='image/'+match[1];
  const blob=await put('photos/'+id+'.'+match[1],bytes,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:type,cacheControlMaxAge:60});
  await put('photo-metadata/'+id+'.json',JSON.stringify({owner:person.id,signupCreatedAt:person.createdAt,date,type,url:blob.url,createdAt:new Date().toISOString()}),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60});
  return json(res,200,{id});
 }catch(error){console.error('Photo request failed:',error.name);return json(res,503,{error:'Could not save or load the photo. Please try again.'});}
}

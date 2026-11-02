import {authenticated,sameOrigin,json,body} from '../lib/admin-auth.js';
import {getStore,PaymentConflict,SignupNotFound,PaymentRequired} from '../lib/store.js';
export default async function handler(req,res){
  if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});
  if(req.method!=='POST')return json(res,405,{error:'POST required.'});
  if(!sameOrigin(req))return json(res,403,{error:'Please update enrollment from this website.'});
  let data;try{data=body(req);}catch{return json(res,400,{error:'Invalid request.'});}
  if(!/^[a-f0-9]{64}$/.test(data.id||'') || typeof data.enrolled!=='boolean' || !(data.expectedVersion===null || (typeof data.expectedVersion==='string' && data.expectedVersion.length<=200)))return json(res,400,{error:'Invalid enrollment update.'});
  try{return json(res,200,{ok:true,payment:await getStore().setEnrollment(data.id,data.enrolled,data.expectedVersion)});}
  catch(error){
    if(error instanceof PaymentRequired)return json(res,422,{error:'Mark the $150 payment received before enrolling this person.'});
    if(error instanceof PaymentConflict)return json(res,409,{error:'This signup was changed in another tab. Refresh and try again.'});
    if(error instanceof SignupNotFound)return json(res,404,{error:'This signup no longer exists.'});
    console.error('Enrollment update failed:',error.name);return json(res,503,{error:'Enrollment was not saved. Please try again.'});
  }
}

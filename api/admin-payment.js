import {FOUNDING, NEXT} from '../lib/cohorts.js';
import {authenticated,sameOrigin,json,body} from '../lib/admin-auth.js';
import {getStore,PaymentConflict,SignupNotFound,PaymentRequired} from '../lib/store.js';
export default async function handler(req,res){
  if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});
  if(req.method!=='POST')return json(res,405,{error:'POST required.'});
  if(!sameOrigin(req))return json(res,403,{error:'Please update payments from this website.'});
  let data;try{data=body(req);}catch{return json(res,400,{error:'Invalid request.'});}
  const cohort=new URL(req.url||'/','https://'+req.headers.host).searchParams.get('cohort')??FOUNDING;
  if(cohort!==FOUNDING&&cohort!==NEXT)return json(res,400,{error:'Invalid cohort.'});
  if(!/^[a-f0-9]{64}$/.test(data.id||'') || typeof data.paid!=='boolean' || !(data.expectedVersion===null || (typeof data.expectedVersion==='string' && data.expectedVersion.length<=200)))return json(res,400,{error:'Invalid payment update.'});
  if(cohort===NEXT&&data.paid&&!['venmo','rollover'].includes(data.method))return json(res,400,{error:'Choose how the stake was funded.'});
  if(cohort===NEXT&&data.paid&&data.method==='rollover'&&
    (!Number.isInteger(data.rolloverCents)||data.rolloverCents<1||data.rolloverCents>15000)){
    return json(res,400,{error:'Enter a rollover amount between $0.01 and $150.'});
  }
  try{return json(res,200,{ok:true,payment:await getStore().setPayment(data.id,data.paid,data.expectedVersion,cohort,data.method,data.rolloverCents)});}
  catch(error){
    if(error instanceof PaymentRequired)return json(res,422,{error:'Only returning writers can roll over a stake.'});
    if(error instanceof PaymentConflict)return json(res,409,{error:'This payment was changed in another tab. Refresh and try again.'});
    if(error instanceof SignupNotFound)return json(res,404,{error:'This signup no longer exists.'});
    console.error('Admin payment update failed:',error.name);return json(res,503,{error:'Payment was not saved. Please try again.'});
  }
}

import {FOUNDING, NEXT} from '../lib/cohorts.js';
import {authenticated,json} from '../lib/admin-auth.js';
import {getStore} from '../lib/store.js';
export default async function handler(req,res){
  if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});
  if(req.method!=='GET')return json(res,405,{error:'GET required.'});
  const cohort=new URL(req.url||'/api/admin-signups','https://'+req.headers.host).searchParams.get('cohort')??FOUNDING;
  if(cohort!==FOUNDING&&cohort!==NEXT)return json(res,400,{error:'Invalid cohort.'});
  try{return json(res,200,{signups:await getStore().adminList(cohort),stakeCents:15000});}
  catch(error){console.error('Admin list failed:',error.name);return json(res,503,{error:'Could not load signups. Please refresh.'});}
}

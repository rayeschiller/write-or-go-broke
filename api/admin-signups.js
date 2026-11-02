import {authenticated,json} from '../lib/admin-auth.js';
import {getStore} from '../lib/store.js';
export default async function handler(req,res){
  if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});
  if(req.method!=='GET')return json(res,405,{error:'GET required.'});
  try{return json(res,200,{signups:await getStore().adminList(),stakeCents:15000});}
  catch(error){console.error('Admin list failed:',error.name);return json(res,503,{error:'Could not load signups. Please refresh.'});}
}

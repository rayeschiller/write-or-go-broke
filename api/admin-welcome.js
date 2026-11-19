import {FOUNDING,NEXT} from '../lib/cohorts.js';
import {authenticated,sameOrigin,json,body} from '../lib/admin-auth.js';
import {getStore} from '../lib/store.js';
import {sendWelcomeForRequest} from '../lib/welcome.js';
export default async function handler(req,res){
 if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});
 if(req.method!=='POST')return json(res,405,{error:'POST required.'});
 if(!sameOrigin(req))return json(res,403,{error:'Please use this website.'});
 let data;try{data=body(req);}catch{return json(res,400,{error:'Invalid request.'});}
 const cohort=new URL(req.url||'/','https://'+req.headers.host).searchParams.get('cohort')??FOUNDING;
 if(![FOUNDING,NEXT].includes(cohort)||!/^[a-f0-9]{64}$/.test(data.id||''))return json(res,400,{error:'Invalid welcome email request.'});
 try{
  if(!await getStore().allowRequest('admin-welcome:'+data.id))return json(res,429,{error:'Please wait before retrying the welcome email.'});
  return json(res,200,{ok:true,welcome:await sendWelcomeForRequest(req,data.id,cohort)});
 }catch(error){console.error('Welcome retry failed:',error.name);return json(res,503,{error:'Could not retry the welcome email.'});}
}

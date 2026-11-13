import {handle} from '../lib/handler.js';
import {NEXT} from '../lib/cohorts.js';
import {nextRegistrationOpen} from '../lib/next-cohort.js';

export default async function handler(req,res){
  if(req.method==='GET'&&new URL(req.url||'/api/signup','https://'+req.headers.host).searchParams.get('cohort')===NEXT){
    res.setHeader('Cache-Control','no-store');
    try{return res.status(200).json({open:await nextRegistrationOpen()});}
    catch(error){
      console.error('November registration status failed:',error.name);
      return res.status(503).json({error:'Could not check November registration.'});
    }
  }
  return handle(req,res,'signup');
}

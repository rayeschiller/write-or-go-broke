import {timingSafeEqual,createHash} from 'node:crypto';
import {runReminders} from '../lib/reminders.js';
import {json,authenticated} from '../lib/admin-auth.js';
const hash=v=>createHash('sha256').update(String(v)).digest();
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
 const query=new URL(req.url,'https://'+req.headers.host).searchParams;const dryRun=query.get('dryRun')==='1';
 const cronAuthenticated=!!process.env.CRON_SECRET&&timingSafeEqual(hash(req.headers.authorization||''),hash('Bearer '+process.env.CRON_SECRET));
 if(!cronAuthenticated&&!(dryRun&&authenticated(req)))return json(res,401,{error:'Unauthorized.'});
 try{const result=await runReminders({dryRun,previewSlot:query.get('slot')});return json(res,result.ok?200:503,result);}
 catch(error){console.error('Reminder job failed:',error.name);return json(res,503,{error:'Reminder job failed.'});}
}

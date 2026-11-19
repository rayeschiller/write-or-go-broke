import {createWelcomeLinkPreparer} from './welcome-link.js';
import {put} from '@vercel/blob';
import {read} from './store.js';
import {deliverEmail} from './reminders.js';
import {createWelcomeSender} from './welcome-flow.js';
const options={access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60};
async function write(path,data,previous){
 const saved=await put(path,JSON.stringify(data),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});
 return {data,etag:saved.etag};
}
const prepareLink=createWelcomeLinkPreparer({read,write});
const sender=createWelcomeSender({read,write,prepareLink,deliver:deliverEmail,config:()=>({enabled:!!(process.env.RESEND_API_KEY&&process.env.REMINDER_FROM),from:process.env.REMINDER_FROM,replyTo:process.env.REMINDER_REPLY_TO,origin:'https://write.rayeschiller.com'})});
export async function sendWelcomeForRequest(req,id,cohort){
 // Staging and preview environments must never mail real participants.
 const host=String(req.headers.host||'').toLowerCase();
 if(!['write.rayeschiller.com','write-or-go-broke.vercel.app'].includes(host))return {status:'skipped',message:'Welcome emails only send from the live site.'};
 return sender(id,cohort);
}

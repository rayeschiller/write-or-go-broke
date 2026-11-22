import {FOUNDING,NEXT,nextQuery} from '../lib/cohorts.js';
import {waitUntil} from '@vercel/functions';
import {deliverEmail} from '../lib/reminders.js';
import {passwordResetEmail} from '../lib/password-reset-email.js';
import {joinNext,nextStatus,personInCohort,rolloverQuote} from '../lib/next-cohort.js';
import {adminCheckins,editCheckin} from '../lib/admin-checkins.js';
import {community,savePreferences,adminFinances,recordPayout,editWriting} from '../lib/community-store.js';
import {authenticated,sameOrigin,json,body} from '../lib/admin-auth.js';
import {normalizeIdentifier,validPassword,secret,issueParticipant,participantCookie,participantIdentity} from '../lib/participant-auth.js';
import {getStore} from '../lib/store.js';
import {digest} from '../lib/participant-auth.js';
import {settings,updateSettings,makeInvite,makePasswordReset,activate,login,validateIdentity,participantDashboard,checkin,allowAttempt,AccountError} from '../lib/participant-store.js';

async function sendPasswordReset(email,cohort){
  try{
    const reset=await makePasswordReset(email,cohort);
    if(!reset)return;
    const url='https://write.rayeschiller.com/challenge'+(cohort===NEXT?nextQuery:'')+'#reset='+reset.id+'&token='+reset.token;
    await deliverEmail({
      from:process.env.REMINDER_FROM,to:[reset.email],reply_to:process.env.REMINDER_REPLY_TO||undefined,
      ...passwordResetEmail(url),
    },'participant-reset/'+digest(reset.token));
  }catch(error){
    console.error('Password reset delivery failed:',{name:error.name,status:error.providerStatus});
  }
}
export default async function handler(req,res){
  try{
    const query=new URL(req.url||'/api/participant','https://'+req.headers.host).searchParams;
    const cohort=query.get('cohort')??FOUNDING;
    if(cohort!==FOUNDING&&cohort!==NEXT)return json(res,400,{error:'Invalid cohort.'});
    if(req.method==='GET'){
      if(query.get('action')==='admin-checkins'){if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});const id=query.get('id');if(!/^[a-f0-9]{64}$/.test(id||''))return json(res,400,{error:'Invalid participant.'});return json(res,200,await adminCheckins(id,cohort));}
      if(query.get('action')==='admin-finances'){if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});return json(res,200,await adminFinances(cohort));}
      if(query.get('action')==='admin-settings'){
        if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});
        return json(res,200,{settings:await settings(cohort)});
      }
      const person=await validateIdentity(participantIdentity(req));
      if(!person)return json(res,401,{error:'Please log in to your challenge.'});
      if(query.get('action')==='next-status')return json(res,200,await nextStatus(person));
      if(query.get('action')==='renewal-status'){
        const next=await nextStatus(person);
        const quote=next.foundingEnrolled&&(next.canJoin||next.requested)?await rolloverQuote(person):null;
        return json(res,200,{next,quote});
      }
      if(query.get('action')==='community')return json(res,200,await community(await personInCohort(person,cohort),cohort));
      if(cohort===NEXT || person.accountCohort===NEXT){
        const next=await nextStatus(person);
        return json(res,200,{person:{name:person.name},next});
      }
      return json(res,200,await participantDashboard(person));
    }
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
    if(!sameOrigin(req))return json(res,403,{error:'Please use this website to continue.'});
    let data;try{data=body(req);}catch{return json(res,400,{error:'Invalid request.'});}
    if(['admin-invite','admin-settings','admin-payout','admin-checkin'].includes(data.action)){
      if(!authenticated(req))return json(res,401,{error:'Admin sign-in required.'});
      if(data.action==='admin-checkin'){if(!/^[a-f0-9]{64}$/.test(data.id||''))return json(res,400,{error:'Invalid participant.'});return json(res,200,await editCheckin(data.id,data,cohort));}
      if(data.action==='admin-payout'){if(!/^[a-f0-9]{64}$/.test(data.id||''))return json(res,400,{error:'Invalid participant.'});return json(res,200,{payout:await recordPayout(data.id,data,cohort)});}
      if(data.action==='admin-settings'){
        if(cohort===NEXT)return json(res,409,{error:'The November cohort schedule is fixed.'});
        return json(res,200,{settings:await updateSettings(data)});
      }
      if(!/^[a-f0-9]{64}$/.test(data.id||''))return json(res,400,{error:'Invalid signup.'});
      const invite=await makeInvite(data.id,cohort);
      return json(res,200,{url:'https://'+req.headers.host+'/challenge'+(cohort===NEXT?nextQuery:'')+'#setup='+invite.id+'&token='+invite.token,expiresAt:invite.expiresAt});
    }
    if(data.action==='logout'){res.setHeader('Set-Cookie',participantCookie(''));return json(res,200,{ok:true});}
    if(!secret())return json(res,503,{error:'Participant login is not configured yet.'});
    if(data.action==='request-password-reset'){
      const identifier=normalizeIdentifier(data.email);
      if(identifier?.type!=='email')return json(res,400,{error:'Enter the email address from your signup.'});
      const host=String(req.headers.host||'').toLowerCase();
      if(!['write.rayeschiller.com','write-or-go-broke.vercel.app'].includes(host)||
        (process.env.VERCEL_ENV && process.env.VERCEL_ENV!=='production')||
        !process.env.RESEND_API_KEY||!process.env.REMINDER_FROM){
        return json(res,503,{error:'Reset emails are unavailable right now. Ask Raye for a private reset link.'});
      }
      if(!await allowAttempt('participant-reset',req))return json(res,429,{error:'Too many requests. Try again in 10 minutes.'});
      waitUntil(sendPasswordReset(identifier.value,cohort));
      return json(res,202,{ok:true});
    }
    if(data.action==='activate'||data.action==='reset-password'||data.action==='login'){
      if(!await allowAttempt(cohort===NEXT?'participant-auth-november':'participant-auth',req))return json(res,429,{error:'Too many attempts. Try again in 10 minutes.'});
      if(!validPassword(data.password))return json(res,400,{error:'Use a password between 10 and 128 characters.'});
      let identity;
      if(data.action!=='login'){
        if(!/^[a-f0-9]{64}$/.test(data.id||'')||typeof data.token!=='string'||data.token.length>100)return json(res,400,{error:'Invalid setup link.'});
        identity=await activate(data.id,data.token,data.password,data.action==='reset-password');
      }else{
        const identifier=normalizeIdentifier(data.identifier);
        if(!identifier)return json(res,400,{error:'Enter the email or US phone number from your signup.'});
        if(!await getStore().allowRequest('participant-contact:'+digest(identifier.value)))return json(res,429,{error:'Too many attempts. Try again in 10 minutes.'});
        identity=await login(identifier,data.password,cohort);
      }
      res.setHeader('Set-Cookie',participantCookie(issueParticipant(identity.id,identity.version)));return json(res,200,{ok:true});
    }
    if(data.action==='join-next'){
      const person=await validateIdentity(participantIdentity(req));
      if(!person)return json(res,401,{error:'Please log in to continue.'});
      return json(res,200,await joinNext(person,data.rollover));
    }
    if(data.action==='preferences'){const person=await validateIdentity(participantIdentity(req));if(!person)return json(res,401,{error:'Please log in.'});return json(res,200,{preferences:await savePreferences(await personInCohort(person,cohort),data,cohort)});}
    if(data.action==='edit-writing'){const person=await validateIdentity(participantIdentity(req));if(!person)return json(res,401,{error:'Please log in.'});return json(res,200,{ok:true,writing:await editWriting(await personInCohort(person,cohort),data.date,data.content,cohort)});}
    if(data.action==='checkin'){
      const person=await validateIdentity(participantIdentity(req));
      if(!person)return json(res,401,{error:'Please log in to your challenge.'});
      if(data.wrote!==true)return json(res,400,{error:'Confirm that you wrote standup for at least 10 minutes today.'});
      return json(res,200,{ok:true,checkin:await checkin(await personInCohort(person,cohort),undefined,data.content,cohort)});
    }
    return json(res,400,{error:'Unknown action.'});
  }catch(error){
    if(error instanceof AccountError)return json(res,error.status,{error:error.message});
    console.error('Participant request failed:',{name:error.name,message:error.message,code:error.code,stack:error.stack});return json(res,503,{error:'Could not complete that request. Please try again.'});
  }
}

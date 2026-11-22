import {FOUNDING, NEXT, NEXT_SCHEDULE, signupPath, paymentPath, signupPrefix} from './cohorts.js';
import {saveWriting} from './community-store.js';
import {put,BlobPreconditionFailedError} from '@vercel/blob';
import {read,documents,getStore} from './store.js';
import {token,digest,passwordRecord,verifyPassword} from './participant-auth.js';
import {challengeState,validDate,validTimezone} from './challenge.js';
const options={access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60};
export class AccountError extends Error{constructor(message,status=400){super(message);this.status=status;}}
async function write(path,data,previous){return put(path,JSON.stringify(data),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});}
export async function settings(cohort=FOUNDING){if(cohort===NEXT)return {...NEXT_SCHEDULE,version:null};const s=await read('challenge/'+FOUNDING+'.json');return {...(s?.data||{startDate:null,timezone:null}),version:s?.etag||null};}
export async function updateSettings(data){
  if(!validDate(data.startDate)||!validTimezone(data.timezone))throw new AccountError('Choose a valid start date and timezone.');
  const path='challenge/'+FOUNDING+'.json';const previous=await read(path);
  if((previous?.etag||null)!==data.expectedVersion)throw new AccountError('Settings changed in another tab. Refresh and try again.',409);
  if(previous?.data.startDate && challengeState(previous.data).phase!=='upcoming')throw new AccountError('The challenge has started. Its start date and timezone are locked.',409);
  const saved={startDate:data.startDate,timezone:data.timezone,updatedAt:new Date().toISOString()};
  const result=await write(path,saved,previous);return {...saved,version:result.etag};
}
export async function findSignup(identifier,cohort=FOUNDING){
  if(cohort===NEXT){
    if(identifier.type==='email'){
      const id=digest(NEXT+':'+identifier.value);
      const saved=await read(signupPath(id,NEXT));
      return saved?{id,...saved.data}:null;
    }
    const nextSignups=(await documents(signupPrefix(NEXT))).filter(s=>s.data.source==='new'&&s.data.phone===identifier.value);
    const foundingSignups=(await documents('signups/')).filter(s=>s.data.phone===identifier.value);
    const matches=[...nextSignups,...foundingSignups];
    return matches.length===1?{id:matches[0].id,...matches[0].data}:null;
  }
  if(identifier.type==='email'){const id=digest(identifier.value);const saved=await read('signups/'+id+'.json');return saved?{id,...saved.data}:null;}
  const matches=(await documents('signups/')).filter(s=>s.data.phone===identifier.value);
  // A shared phone number cannot silently select another person's account.
  return matches.length===1?{id:matches[0].id,...matches[0].data}:null;
}
export async function makeInvite(id,cohort=FOUNDING){
  const signup=await read(signupPath(id,cohort));const payment=await read(paymentPath(id,cohort));
  if(signup?.data.source==='returning')throw new AccountError('This writer uses their founding cohort login. Reset it from the founding roster.',422);
  if(!signup)throw new AccountError('Signup not found.',404);
  if(!payment?.data.paid||!payment?.data.enrolled)throw new AccountError('Mark this person paid and enrolled before creating their login link.',422);
  const path='accounts/'+id+'.json';const previous=await read(path);const access=token();
  const expiresAt=new Date(Date.now()+72*3600000).toISOString();
  await write(path,{...(previous?.data||{}),inviteCohort:cohort,inviteHash:digest(access),inviteExpiresAt:expiresAt,inviteSignupCreatedAt:signup.data.createdAt,updatedAt:new Date().toISOString()},previous);
  return {id,token:access,expiresAt};
}
export async function makePasswordReset(email,cohort){
  // Prefer the selected cohort, with a fallback for writers using their founding login.
  const signups=await Promise.all([cohort,cohort===NEXT?FOUNDING:NEXT].map(round=>findSignup({type:'email',value:email},round)));
  const accounts=await Promise.all(signups.map(signup=>signup&&read('accounts/'+signup.id+'.json')));
  const index=accounts.findIndex((account,i)=>account?.data.passwordHash&&account.data.signupCreatedAt===signups[i].createdAt);
  if(index<0)return null;
  const signup=signups[index];
  const previous=accounts[index];
  const now=Date.now();
  if(now-Date.parse(previous.data.resetIssuedAt)<600000)return null;
  const access=token();
  try{
    await write('accounts/'+signup.id+'.json',{
      ...previous.data,resetHash:digest(access),resetIssuedAt:new Date(now).toISOString(),
      resetExpiresAt:new Date(now+3600000).toISOString(),
    },previous);
  }catch(error){
    if(error instanceof BlobPreconditionFailedError)return null;
    throw error;
  }
  return {id:signup.id,token:access,email:signup.email};
}
export async function activate(id,access,password,reset=false){
  const path='accounts/'+id+'.json';const previous=await read(path);
  const linkError=reset?'This reset link is invalid, expired or already used. Request a new one.':'This setup link is invalid, expired or already used. Ask Raye for a new one.';
  const hash=reset?previous?.data.resetHash:previous?.data.inviteHash;
  const expiresAt=reset?previous?.data.resetExpiresAt:previous?.data.inviteExpiresAt;
  if(!hash || digest(access)!==hash || !(Date.parse(expiresAt)>Date.now()))throw new AccountError(linkError,401);
  const accountCohort=(reset?previous.data.accountCohort:previous.data.inviteCohort)||FOUNDING;
  const signup=await read(signupPath(id,accountCohort));
  const signupCreatedAt=reset?previous.data.signupCreatedAt:previous.data.inviteSignupCreatedAt;
  if(!signup || signupCreatedAt!==signup.data.createdAt)throw new AccountError(linkError,401);
  const passwordData=await passwordRecord(password);const version=token();
  const account={...passwordData,accountCohort,authVersion:version,signupCreatedAt:signup.data.createdAt,createdAt:previous.data.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  try{await write(path,account,previous);}catch(error){
    if(error instanceof BlobPreconditionFailedError)throw new AccountError(linkError,409);
    throw error;
  }
  return {id,version};
}
export async function login(identifier,password,cohort=FOUNDING){
  let signup=await findSignup(identifier,cohort);
  if(cohort===NEXT && !signup && identifier.type==='email')signup=await findSignup(identifier);
  const saved=signup?await read('accounts/'+signup.id+'.json'):null;
  if(!await verifyPassword(password,saved?.data) || saved?.data.signupCreatedAt!==signup?.createdAt)throw new AccountError('Email/phone or password did not match. If this is your first visit, use your private setup link.',401);
  return {id:signup.id,version:saved.data.authVersion};
}
export async function validateIdentity(identity){
  if(!identity)return null;
  const account=await read('accounts/'+identity.id+'.json');
  if(account?.data.authVersion!==identity.version)return null;
  const accountCohort=account.data.accountCohort||FOUNDING;
  const signup=await read(signupPath(identity.id,accountCohort));
  return signup && signup.data.createdAt===account.data.signupCreatedAt?{id:identity.id,...signup.data,accountCohort}:null;
}
export async function participantDashboard(person,cohort=FOUNDING){
  const [schedule,payment,checks]=await Promise.all([settings(cohort),read(paymentPath(person.id,cohort)),documents('checkins/'+cohort+'/'+person.id+'/')]);
  const state=challengeState(schedule);const completed=checks.filter(c=>c.data.signupCreatedAt===person.createdAt&&c.data.completed!==false).map(c=>({date:c.data.date,completedAt:c.data.completedAt}));
  return {person:{name:person.name,email:person.email,phone:person.phone},paid:payment?.data.paid===true,enrolled:payment?.data.paid===true&&payment?.data.enrolled===true,
    schedule:{startDate:schedule.startDate,timezone:schedule.timezone},...state,completed};
}
export async function checkin(person,verifiedSchedule,content,cohort=FOUNDING){
  const [schedule,payment]=await Promise.all([verifiedSchedule||settings(cohort),read(paymentPath(person.id,cohort))]);
  if(!payment?.data.paid||!payment?.data.enrolled)throw new AccountError('Your payment and challenge enrollment must be confirmed before you can check in.',403);
  const state=challengeState(schedule);
  if(state.phase!=='active')throw new AccountError(state.phase==='ended'?'This 30-day challenge has ended.':state.phase==='unconfigured'?'The challenge schedule has not been confirmed yet.':'The challenge has not started yet.',403);
  if(content!==undefined)await saveWriting(person,state.today,content,cohort);
  const path='checkins/'+cohort+'/'+person.id+'/'+state.today+'.json';const previous=await read(path);
  if(previous&&previous.data.completed!==false)return {date:state.today,completedAt:previous.data.completedAt,alreadyCompleted:true};
  const data={signupId:person.id,cohortId:cohort,date:state.today,timezone:schedule.timezone,day:state.day,completedAt:new Date().toISOString(),minimumMinutes:10,signupCreatedAt:person.createdAt};
  try{await write(path,{...data,adminEdits:previous?.data.adminEdits||[]},previous);}catch(error){const existing=await read(path);if(!existing)throw error;return {date:state.today,completedAt:existing.data.completedAt,alreadyCompleted:true};}
  return {...data,alreadyCompleted:false};
}
export async function allowAttempt(scope,req){const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'anonymous').split(',')[0].trim();return getStore().allowRequest(scope+':'+ip);}

import {saveWriting} from './community-store.js';
import {put} from '@vercel/blob';
import {read,documents,getStore} from './store.js';
import {token,digest,passwordRecord,verifyPassword} from './participant-auth.js';
import {COHORT,challengeState,validDate,validTimezone} from './challenge.js';
const options={access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60};
export class AccountError extends Error{constructor(message,status=400){super(message);this.status=status;}}
async function write(path,data,previous){return put(path,JSON.stringify(data),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});}
export async function settings(){const s=await read('challenge/'+COHORT+'.json');return {...(s?.data||{startDate:null,timezone:null}),version:s?.etag||null};}
export async function updateSettings(data){
  if(!validDate(data.startDate)||!validTimezone(data.timezone))throw new AccountError('Choose a valid start date and timezone.');
  const path='challenge/'+COHORT+'.json';const previous=await read(path);
  if((previous?.etag||null)!==data.expectedVersion)throw new AccountError('Settings changed in another tab. Refresh and try again.',409);
  if(previous?.data.startDate && challengeState(previous.data).phase!=='upcoming')throw new AccountError('The challenge has started. Its start date and timezone are locked.',409);
  const saved={startDate:data.startDate,timezone:data.timezone,updatedAt:new Date().toISOString()};
  const result=await write(path,saved,previous);return {...saved,version:result.etag};
}
export async function findSignup(identifier){
  if(identifier.type==='email'){const id=digest(identifier.value);const saved=await read('signups/'+id+'.json');return saved?{id,...saved.data}:null;}
  const matches=(await documents('signups/')).filter(s=>s.data.phone===identifier.value);
  // A shared phone number cannot silently select another person's account.
  return matches.length===1?{id:matches[0].id,...matches[0].data}:null;
}
export async function makeInvite(id){
  const signup=await read('signups/'+id+'.json');const payment=await read('payments/'+id+'.json');
  if(!signup)throw new AccountError('Signup not found.',404);
  if(!payment?.data.paid||!payment?.data.enrolled)throw new AccountError('Mark this person paid and enrolled before creating their login link.',422);
  const path='accounts/'+id+'.json';const previous=await read(path);const access=token();
  const expiresAt=new Date(Date.now()+72*3600000).toISOString();
  await write(path,{...(previous?.data||{}),inviteHash:digest(access),inviteExpiresAt:expiresAt,inviteSignupCreatedAt:signup.data.createdAt,updatedAt:new Date().toISOString()},previous);
  return {id,token:access,expiresAt};
}
export async function activate(id,access,password){
  const path='accounts/'+id+'.json';const previous=await read(path);
  if(!previous?.data.inviteHash || digest(access)!==previous.data.inviteHash || Date.parse(previous.data.inviteExpiresAt)<=Date.now())throw new AccountError('This setup link is invalid, expired or already used. Ask Raye for a new one.',401);
  const signup=await read('signups/'+id+'.json');
  if(!signup || previous.data.inviteSignupCreatedAt!==signup.data.createdAt)throw new AccountError('This setup link no longer matches the signup. Ask Raye for a new one.',401);
  const passwordData=await passwordRecord(password);const version=token();
  const account={...passwordData,authVersion:version,signupCreatedAt:signup.data.createdAt,createdAt:previous.data.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  try{await write(path,account,previous);}catch{throw new AccountError('This setup link was already used or changed. Ask Raye for a new one.',409);}
  return {id,version};
}
export async function login(identifier,password){
  const signup=await findSignup(identifier);const saved=signup?await read('accounts/'+signup.id+'.json'):null;
  if(!await verifyPassword(password,saved?.data) || saved?.data.signupCreatedAt!==signup?.createdAt)throw new AccountError('Email/phone or password did not match. If this is your first visit, use your private setup link.',401);
  return {id:signup.id,version:saved.data.authVersion};
}
export async function validateIdentity(identity){
  if(!identity)return null;
  const account=await read('accounts/'+identity.id+'.json');
  if(account?.data.authVersion!==identity.version)return null;
  const signup=await read('signups/'+identity.id+'.json');return signup && signup.data.createdAt===account.data.signupCreatedAt?{id:identity.id,...signup.data}:null;
}
export async function participantDashboard(person){
  const [schedule,payment,checks]=await Promise.all([settings(),read('payments/'+person.id+'.json'),documents('checkins/'+COHORT+'/'+person.id+'/')]);
  const state=challengeState(schedule);const completed=checks.filter(c=>c.data.signupCreatedAt===person.createdAt&&c.data.completed!==false).map(c=>({date:c.data.date,completedAt:c.data.completedAt}));
  return {person:{name:person.name,email:person.email,phone:person.phone},paid:payment?.data.paid===true,enrolled:payment?.data.paid===true&&payment?.data.enrolled===true,
    schedule:{startDate:schedule.startDate,timezone:schedule.timezone},...state,completed};
}
export async function checkin(person,verifiedSchedule,content){
  const [schedule,payment]=await Promise.all([verifiedSchedule||settings(),read('payments/'+person.id+'.json')]);
  if(!payment?.data.paid||!payment?.data.enrolled)throw new AccountError('Your payment and challenge enrollment must be confirmed before you can check in.',403);
  const state=challengeState(schedule);
  if(state.phase!=='active')throw new AccountError(state.phase==='ended'?'This 30-day challenge has ended.':state.phase==='unconfigured'?'The challenge schedule has not been confirmed yet.':'The challenge has not started yet.',403);
  if(content!==undefined)await saveWriting(person,state.today,content);
  const path='checkins/'+COHORT+'/'+person.id+'/'+state.today+'.json';const previous=await read(path);
  if(previous&&previous.data.completed!==false)return {date:state.today,completedAt:previous.data.completedAt,alreadyCompleted:true};
  const data={signupId:person.id,cohortId:COHORT,date:state.today,timezone:schedule.timezone,day:state.day,completedAt:new Date().toISOString(),minimumMinutes:10,signupCreatedAt:person.createdAt};
  try{await write(path,{...data,adminEdits:previous?.data.adminEdits||[]},previous);}catch(error){const existing=await read(path);if(!existing)throw error;return {date:state.today,completedAt:existing.data.completedAt,alreadyCompleted:true};}
  return {...data,alreadyCompleted:false};
}
export async function allowAttempt(scope,req){const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'anonymous').split(',')[0].trim();return getStore().allowRequest(scope+':'+ip);}

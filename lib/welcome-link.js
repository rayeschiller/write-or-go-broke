import {digest} from './participant-auth.js';
import {FOUNDING,NEXT,signupPath} from './cohorts.js';
export function createWelcomeLinkPreparer({read,write,now=()=>Date.now()}){
 return async function prepareLink({id,cohort,signup,access,expiresAt,origin}){
  const returning=signup.source==='returning';
  const accountCohort=returning?FOUNDING:cohort;
  const accountSignup=returning?(await read(signupPath(id,FOUNDING)))?.data:signup;
  if(!accountSignup||(returning&&accountSignup.createdAt!==signup.foundingSignupCreatedAt))throw Error('Signup linkage changed');
  const path='accounts/'+id+'.json';const previous=await read(path);
  const url=origin+'/challenge'+(cohort===NEXT?'?cohort='+NEXT:'');
  if(previous?.data.passwordHash&&previous.data.signupCreatedAt===accountSignup.createdAt)return {url,setup:false};
  if(Date.parse(expiresAt)<=now())throw Error('Welcome setup link expired');
  const inviteHash=digest(access);
  if(previous?.data.inviteHash!==inviteHash){
   await write(path,{...(previous?.data||{}),inviteCohort:accountCohort,inviteHash,inviteExpiresAt:expiresAt,inviteSignupCreatedAt:accountSignup.createdAt,updatedAt:new Date(now()).toISOString()},previous);
  }
  return {url:url+'#setup='+id+'&token='+access,setup:true};
 };
}

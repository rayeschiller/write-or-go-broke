import {createHash} from 'node:crypto';
import {get,head,put,del,list,BlobPreconditionFailedError,BlobNotFoundError} from '@vercel/blob';

const digest=value=>createHash('sha256').update(value).digest('hex');
const options={access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60};
export function sameBlobVersion(downloadEtag,currentEtag){return typeof downloadEtag==='string'&&typeof currentEtag==='string'&&downloadEtag.replace(/^W\//,'')===currentEtag;}
export async function read(path,attempt=0){
  const result=await get(path,{access:'private',useCache:false});
  if(!result || result.statusCode!==200)return null;
  const data=await new Response(result.stream).json();let etag=result.blob.etag;
  // Compressed downloads carry weak ETags, which cannot be used for If-Match.
  // Compare against the storage metadata before pairing a strong ETag with data.
  if(etag.startsWith('W/')){
    let metadata;try{metadata=await head(path);}catch(error){if(error instanceof BlobNotFoundError&&attempt<2)return read(path,attempt+1);throw error;}
    if(!sameBlobVersion(etag,metadata.etag)){if(attempt<2)return read(path,attempt+1);throw new BlobPreconditionFailedError('Record changed while reading. Retry the request.');}
    etag=metadata.etag;
  }
  return {data,etag};
}
export async function documents(prefix){
  const records=[];let cursor;
  do{
    const page=await list({prefix,cursor,limit:1000});
    for(let offset=0;offset<page.blobs.length;offset+=20){
      const batch=await Promise.all(page.blobs.slice(offset,offset+20).map(async blob=>{
        const saved=await read(blob.url);
        return saved?{...saved,id:blob.pathname.slice(prefix.length).replace(/\.json$/,'')}:null;
      }));
      records.push(...batch.filter(Boolean));
    }
    cursor=page.hasMore?page.cursor:undefined;
  }while(cursor);
  return records;
}
export class PaymentConflict extends Error {}
export class SignupNotFound extends Error {}
export class PaymentRequired extends Error {}
export function commitment(previous,change,now=new Date().toISOString()){
  const paid=change.paid ?? (previous?.paid===true);
  const enrolled=paid && (change.enrolled ?? (previous?.enrolled===true));
  if(change.enrolled===true && !paid)throw new PaymentRequired();
  return {paid,method:'venmo',amountCents:paid?15000:0,paidAt:paid?(previous?.paidAt||now):null,
    enrolled,enrolledAt:enrolled?(previous?.enrolledAt||now):null,cohortId:enrolled?'founding-cohort':null,updatedAt:now};
}
async function saveCommitment(id,expectedVersion,change){
  if(!await read('signups/'+id+'.json'))throw new SignupNotFound();
  const path='payments/'+id+'.json';const previous=await read(path);
  if((previous?.etag||null)!==expectedVersion)throw new PaymentConflict();
  const payment={signupId:id,...commitment(previous?.data,change)};
  try{
    const result=await put(path,JSON.stringify(payment),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});
    return {...payment,paymentVersion:result.etag};
  }catch(error){
    if(error instanceof BlobPreconditionFailedError)throw new PaymentConflict();
    const current=await read(path);
    if((current?.etag||null)!==expectedVersion)throw new PaymentConflict();
    throw error;
  }
}
export function getStore(){
  return {
    async adminList(){
      const [signups,payments,checks]=await Promise.all([documents('signups/'),documents('payments/'),documents('checkins/founding-cohort/')]);
      const byId=new Map(payments.map(p=>[p.id,p]));
      return signups.map(s=>{
        const payment=byId.get(s.id);
        const completed=checks.filter(c=>c.data.signupId===s.id&&c.data.signupCreatedAt===s.data.createdAt&&c.data.completed!==false).map(c=>c.data.date).sort();
        return {completedDays:completed.length,lastCheckin:completed.at(-1)||null,id:s.id,name:s.data.name,email:s.data.email,phone:s.data.phone,sms:!!s.data.sms,createdAt:s.data.createdAt,
          paid:payment?.data.paid===true,paidAt:payment?.data.paidAt||null,
          enrolled:payment?.data.paid===true && payment?.data.enrolled===true,enrolledAt:payment?.data.enrolledAt||null,cohortId:payment?.data.cohortId||null,
          updatedAt:payment?.data.updatedAt||null,paymentVersion:payment?.etag||null};
      }).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    async setPayment(id,paid,expectedVersion){return saveCommitment(id,expectedVersion,{paid});},
    async setEnrollment(id,enrolled,expectedVersion){return saveCommitment(id,expectedVersion,{enrolled});},
    async allowRequest(ip){
      const path='limits/'+digest(ip)+'.json';
      const window=Math.floor(Date.now()/600000);
      for(let attempt=0;attempt<4;attempt++){
        const previous=await read(path);
        const requests=previous?.data.window===window?previous.data.requests+1:1;
        if(requests>20)return false;
        try{
          await put(path,JSON.stringify({window,requests}),{...options,...(previous?{ifMatch:previous.etag}:{allowOverwrite:false})});
          return true;
        }catch(error){
          // Retry concurrent writes, but never turn a storage failure into a pass.
          if(attempt===3)throw error;
        }
      }
      return false;
    },
    async add(person){
      const path='signups/'+digest(person.email)+'.json';
      if(await read(path))return;
      try{
        await put(path,JSON.stringify({...person,consentVersion:'2026-10-19',createdAt:new Date().toISOString()}),{...options,allowOverwrite:false});
      }catch(error){
        // Concurrent duplicates never overwrite contact details or consent.
        if(!await read(path))throw error;
      }
    },
    async remove(email,phone){
      const path='signups/'+digest(email)+'.json';
      const saved=await read(path);
      if(!saved || saved.data.phone!==phone)return;
      try{await del(path,{ifMatch:saved.etag});}
      catch(error){if(!(error instanceof BlobPreconditionFailedError))throw error;}
    }
  };
}

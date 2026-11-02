export const STAKE=15000,DAILY=500;
export function settleDay(date,people,checkins){
 const eligible=people.filter(p=>p.eligibleFrom<=date).sort((a,b)=>a.id.localeCompare(b.id));
 const wrote=new Set(checkins.filter(c=>c.date===date).map(c=>c.signupId));
 const writers=eligible.filter(p=>wrote.has(p.id));const pool=(eligible.length-writers.length)*DAILY;
 const base=writers.length?Math.floor(pool/writers.length):0,remainder=writers.length?pool%writers.length:0;
 const earnings=new Map(writers.map((p,i)=>[p.id,base+(i<remainder?1:0)]));
 return {date,poolCents:pool,unallocatedCents:writers.length?0:pool,
  entries:eligible.map(p=>({signupId:p.id,wrote:wrote.has(p.id),lostCents:wrote.has(p.id)?0:DAILY,earnedCents:earnings.get(p.id)||0}))};
}
export function balances(people,checkins,days,dates,today){
 return people.map(person=>{
  const checks=new Set(checkins.filter(c=>c.signupId===person.id&&dates.includes(c.date)).map(c=>c.date));
  const entries=days.flatMap(d=>d.entries).filter(e=>e.signupId===person.id);
  const lostCents=entries.reduce((n,e)=>n+e.lostCents,0),earnedCents=entries.reduce((n,e)=>n+e.earnedCents,0);
  return {...person,days:dates.map(date=>checks.has(date)?1:0),written:checks.size,protectedCents:checks.size*DAILY,lostCents,earnedCents,projectedCents:STAKE-lostCents+earnedCents,todayCompleted:checks.has(today)};
 }).sort((a,b)=>b.projectedCents-a.projectedCents||b.written-a.written||a.name.localeCompare(b.name));
}

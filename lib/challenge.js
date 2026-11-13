import {FOUNDING} from './cohorts.js';
export const COHORT=FOUNDING;
export const DURATION=30;
export function validDate(value){return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function validTimezone(value){try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return typeof value==='string' && value.length<100;}catch{return false;}}
export function localDate(now,timezone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=type=>parts.find(p=>p.type===type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(date,days){return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);}
export function challengeState(settings,now=new Date()){
  if(!settings?.startDate || !settings?.timezone)return {phase:'unconfigured',day:null,today:null,dates:[]};
  const calendarDate=localDate(now,settings.timezone);
  const earlyOpen=settings.startDate==='2026-10-19' && settings.timezone==='America/Los_Angeles' && now>=new Date('2026-10-19T06:00:00Z') && calendarDate<settings.startDate;
  const today=earlyOpen?settings.startDate:calendarDate;
  const offset=Math.round((Date.parse(today)-Date.parse(settings.startDate))/86400000);
  const dates=Array.from({length:DURATION},(_,i)=>addDays(settings.startDate,i));
  return {phase:offset<0?'upcoming':offset>=DURATION?'ended':'active',day:offset>=0&&offset<DURATION?offset+1:null,today,dates,endDate:dates.at(-1)};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('scheduled reminders include the new cohort and preserve delivery safeguards',()=>{
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks',new URL('./reminders-runner.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});

import {readFileSync} from 'node:fs';
import {reminderWindow} from '../lib/reminders.js';

test('cron schedules cover 7 pm Pacific in standard and daylight time, with no 9 pm send',()=>{
 const crons=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url))).crons;
 for(const [startDate,date,eveningHour,morningHour,oldHour] of [
  ['2026-11-22','2026-11-25',3,17,5],
  ['2026-10-19','2026-10-25',2,16,4],
 ]){
  const schedule={startDate,timezone:'America/Los_Angeles'};
  const at=hour=>new Date(`${date}T${String(hour).padStart(2,'0')}:00:00Z`);
  assert.ok(crons.some(c=>c.path==='/api/reminders'&&c.schedule===`0 ${eveningHour} * * *`));
  assert.equal(reminderWindow(schedule,at(eveningHour)).slot,'evening');
  assert.equal(reminderWindow(schedule,at(eveningHour)).due,true);
  assert.equal(reminderWindow(schedule,at(oldHour)).due,false);
  assert.equal(reminderWindow(schedule,at(morningHour)).slot,'morning');
  const due=crons.filter(c=>reminderWindow(schedule,at(Number(c.schedule.split(' ')[1]))).due);
  assert.equal(due.length,2,'one morning and one evening window per day');
 }
});

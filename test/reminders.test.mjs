import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('scheduled reminders include the new cohort and preserve delivery safeguards',()=>{
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks',new URL('./reminders-runner.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});

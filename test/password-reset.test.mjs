import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('password recovery works for a returning writer without exposing account status',()=>{
  const runner=new URL('./password-reset-runner.mjs',import.meta.url);
  const result=spawnSync(process.execPath,['--experimental-test-module-mocks',runner.pathname],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});

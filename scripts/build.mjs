import {readFile,access} from 'node:fs/promises';
if(!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)throw Error('Connect the private signup Blob store before deploying.');
if(!process.env.PARTICIPANT_SESSION_SECRET)throw Error('Participant session signing is not configured.');
const config=JSON.parse(await readFile('vercel.json','utf8'));
if(config.outputDirectory!=='public')throw Error('Invalid output directory.');
for(const file of ['public/index.html','public/style.css','public/app.js','api/signup.js','api/remove.js','api/participant.js','public/challenge/index.html','public/challenge/challenge.js','public/cohort/index.html','public/cohort/cohort.js','api/photo.js','lib/admin-checkins.js'])await access(file);
console.log('Static site, signup functions, and private storage configuration verified.');

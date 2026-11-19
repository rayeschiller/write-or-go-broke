import {filterWriting} from './writing-filters.js';
const $=s=>document.querySelector(s);let visibleWriting=20;const expandedWriting=new Set();let model=null,mode='text',photoUrl=null,photoFile=null,existingPhotoId=null,editingDate=null,busy=false;
const nextRound=new URLSearchParams(location.search).get('cohort')==='november-2026';
const nextQuery=nextRound?'?cohort=november-2026':'';
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(c/100);
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function toast(text){$('#toast').textContent=text;setTimeout(()=>$('#toast').textContent='',5500);}
async function api(action,data){const response=await fetch('/api/participant'+(nextQuery+(data?'':(nextQuery?'&':'?')+'action='+action)),{...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})}:{}),credentials:'same-origin',cache:'no-store'});let result;try{result=await response.json();}catch{throw Error('Could not connect. Please try again.');}if(response.status===401){location.replace('/challenge'+nextQuery);throw Error('Please log in.');}if(!response.ok)throw Error(result.error||'Request failed.');return result;}
function view(name){for(const b of document.querySelectorAll('[data-view]')){const active=b.dataset.view===name;b.classList.toggle('active',active);if(b.getAttribute('role')==='tab')b.setAttribute('aria-selected',String(active));}$('#scoreboard-view').hidden=name!=='scoreboard';$('#writing-view').hidden=name!=='writing';}
function dayLabel(date){return new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});}
function avatar(person){const initials=person.name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();return el('span',initials,'avatar');}
function render(resetFeed=true){
 const me=model.records.find(p=>p.id===model.me);if(!me)throw Error('Your cohort enrollment could not be loaded.');
 $('#profile-name').textContent=me.name;$('#cohort-day').textContent=model.day?'Day '+model.day+' of 30':model.phase==='upcoming'?'Starts '+dayLabel(model.schedule.startDate):'30-day challenge complete';
 $('#actual-day').textContent=model.day?String(model.day).padStart(2,'0'):model.phase==='ended'?'30':'—';
 $('#actual-date').textContent=model.today?dayLabel(model.today):'';$('#actual-date').dateTime=model.today||'';
 $('#cohort-label').textContent=nextRound?'NOVEMBER COHORT':'FOUNDING COHORT';
 const cohortLabel=nextRound?'November cohort':'Founding cohort';
 $('#cohort-status').textContent=model.schedule.startDate?cohortLabel+' · '+dayLabel(model.schedule.startDate)+' – '+dayLabel(model.endDate)+' · Midnight '+model.schedule.timezone:cohortLabel+' · Schedule pending';
 $('#protected').textContent=money(me.protectedCents);$('#earned').textContent='+'+money(me.earnedCents);$('#lost').textContent='−'+money(me.lostCents);$('#projected').textContent=money(me.projectedCents);$('#written-count').textContent=me.written+' days checked in';
 $('#checkin-heading').textContent=me.todayCompleted?'Today’s check-in is saved.':model.phase==='upcoming'?'Starts '+dayLabel(model.schedule.startDate):model.phase==='ended'?'The challenge is complete.':'Have you written today?';
 $('#checkin-detail').textContent=me.todayCompleted?'Today’s $5 is protected.':'AT LEAST 10 MIN BB';$('#checkin-open').textContent=me.todayCompleted?'Add or update writing':'I wrote today ↗';
 for(const id of ['#checkin-open','#sidebar-checkin','#share-open'])$(id).disabled=model.phase!=='active';
 $('.closed-day').textContent=model.phase==='active'?'◷ Today’s pool closes at midnight':model.phase==='ended'?'All 30 days are closed':model.schedule.startDate?'Day one is '+dayLabel(model.schedule.startDate):'Schedule pending';
 $('#days-range').textContent='DAYS 1–30';
 $('#scoreboard-body').replaceChildren();
 model.records.forEach((p,index)=>{
  const row=el('tr');if(p.id===model.me)row.classList.add('your-row');const name=el('th');name.scope='row';const identity=el('div',undefined,'identity');identity.append(el('span',String(index+1).padStart(2,'0'),'rank'),avatar(p));const label=el('div');label.append(el('strong',p.name+(p.id===model.me?' (you)':'')));const link=el('button','View writing ↗','text-button');link.addEventListener('click',()=>{$('#author-filter').value=p.id;$('#search').value='';$('#date-filter').value='';view('writing');renderFeed();});label.append(link);identity.append(label);name.append(identity);
  const reps=el('td');const dots=el('div',undefined,'rep-dots');p.days.forEach((done,i)=>{const date=model.dates[i];const state=done?'done':date<model.today?'missed':'pending';const editable=done&&p.id===model.me;const dot=el(editable?'button':'span',done?'✓':date<model.today?'−':String(i+1),state);if(editable){dot.type='button';dot.addEventListener('click',()=>openCheckin(date));}dot.title=dayLabel(date)+': '+(done?'wrote':date<model.today?'no check-in':'not closed');dot.setAttribute('aria-label',dot.title+(editable?' — edit writing':''));dots.append(dot);});reps.append(dots,el('small',p.written+' / 30 days written','rep-caption'));
  row.append(name,reps,el('td',money(p.protectedCents)),el('td','+'+money(p.earnedCents),'positive'),el('td','−'+money(p.lostCents),'negative'),el('td',money(p.projectedCents),'return'));$('#scoreboard-body').append(row);
 });
 $('#balance-lines').replaceChildren();for(const [label,value] of [['Original stake',money(15000)],['Missed-day losses','−'+money(me.lostCents)],['Pool earnings','+'+money(me.earnedCents)],['Projected return',money(me.projectedCents)]]){const line=el('div',undefined,'balance-line');line.append(el('span',label),el('strong',value));$('#balance-lines').append(line);}
 const selection=$('#author-filter').value;$('#author-filter').replaceChildren(new Option('Everyone','all'));for(const p of model.records)$('#author-filter').append(new Option(p.name+(p.id===model.me?' (you)':''),p.id));if([...$('#author-filter').options].some(o=>o.value===selection))$('#author-filter').value=selection;
 $('#post-count').textContent=model.posts.filter(p=>p.shared).length;$('#email-reminder').checked=model.preferences.email;$('#sms-reminder').checked=model.preferences.sms;$('#evening-only').checked=model.preferences.emailTiming==='evening';remindersActive=model.remindersActive;reminderState();
 const chosenDate=$('#date-filter').value;$('#date-filter').replaceChildren(new Option('All dates',''));for(const date of model.dates.filter(d=>d<=model.today).reverse()){const count=model.posts.filter(p=>p.date===date).length;$('#date-filter').append(new Option(dayLabel(date)+' · '+count+' '+(count===1?'post':'posts'),date));}if([...$('#date-filter').options].some(o=>o.value===chosenDate))$('#date-filter').value=chosenDate;
 if(model.unallocatedCents)toast(money(model.unallocatedCents)+' in missed-day pools has no writers and is awaiting an admin decision.');renderFeed(resetFeed);
}
function clearWritingFilters(){$('#search').value='';$('#author-filter').value='all';$('#date-filter').value='';renderFeed();$('#search').focus();}
function renderFeed(reset=true){
 if(reset!==false)visibleWriting=20;
 const filters={author:$('#author-filter').value,date:$('#date-filter').value,query:$('#search').value};
 const active=filters.author!=='all'||!!filters.date||!!filters.query.trim();const posts=filterWriting(model.posts,filters);
 $('#writing-result-count').textContent=posts.length+' '+(posts.length===1?'post':'posts')+(active?' found':'');$('#clear-writing-filters').hidden=!active;
 const feed=$('#writing-feed');feed.replaceChildren();
 if(!posts.length){const empty=el('div',active?'No writing matches these filters.':'No writing has been shared yet.','empty');if(active){const clear=el('button','Clear filters','secondary');clear.type='button';clear.addEventListener('click',clearWritingFilters);empty.append(clear);}feed.append(empty);return;}
 let previousDate=null;
 for(const post of posts.slice(0,visibleWriting)){
  if(post.date!==previousDate){feed.append(el('h3',dayLabel(post.date),'writing-day'));previousDate=post.date;}
  const person=model.records.find(p=>p.id===post.author);const card=el('article',undefined,'writing-card');const head=el('div',undefined,'post-head');head.append(avatar(person));const name=el('div');name.append(el('strong',post.name),el('span',dayLabel(post.date)));head.append(name);card.append(head);
  if(post.text){
   const text=el('p',post.text,'post-text');const long=post.text.length>550||post.text.split('\n').length>8;
   if(long){const expanded=expandedWriting.has(post.id);text.classList.toggle('is-collapsed',!expanded);const more=el('button',expanded?'Read less':'Read more','text-button read-writing');more.type='button';more.setAttribute('aria-expanded',String(expanded));more.setAttribute('aria-label',(expanded?'Read less':'Read more')+' of '+post.name+'’s writing from '+dayLabel(post.date));more.addEventListener('click',()=>{const open=more.getAttribute('aria-expanded')!=='true';more.setAttribute('aria-expanded',String(open));more.textContent=open?'Read less':'Read more';more.setAttribute('aria-label',(open?'Read less':'Read more')+' of '+post.name+'’s writing from '+dayLabel(post.date));text.classList.toggle('is-collapsed',!open);if(open)expandedWriting.add(post.id);else expandedWriting.delete(post.id);});card.append(text,more);}else card.append(text);
  }
  if(post.photo){const image=el('img',undefined,'post-image');image.src=post.photo;image.alt='Writing shared by '+post.name;image.loading='lazy';card.append(image);}
  card.append(el('span',post.shared?'Shared with the cohort':'Private — only you can see this','draft-tag'));
  if(post.author===model.me){const edit=el('button','Edit writing','text-button edit-writing');edit.type='button';edit.addEventListener('click',()=>openCheckin(post.date));card.append(edit);}feed.append(card);
 }
 const paging=el('div',undefined,'writing-pagination');paging.append(el('p','Showing '+Math.min(visibleWriting,posts.length)+' of '+posts.length+' posts'));
 if(visibleWriting<posts.length){const more=el('button','Show '+Math.min(20,posts.length-visibleWriting)+' more','secondary');more.type='button';more.addEventListener('click',()=>{const firstNew=visibleWriting;visibleWriting+=20;renderFeed(false);const target=feed.querySelectorAll('.writing-card')[firstNew];if(target){target.tabIndex=-1;target.focus({preventScroll:true});}});paging.append(more);}feed.append(paging);
}

async function refresh(){const initial=!model;model=await api('community');render(initial);$('#app-error').textContent='';}
function openCheckin(date){clearPhoto();const target=typeof date==='string'?date:model.today;const me=model.records.find(p=>p.id===model.me);editingDate=typeof date==='string'||me.todayCompleted?target:null;mode='text';$('#photo-field').hidden=true;$('#text-field').hidden=false;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode==='text'));const own=model.posts.find(p=>p.author===model.me&&p.date===target);existingPhotoId=own?.photo?new URL(own.photo,location.origin).searchParams.get('id'):null;$('#draft').value=own?.text||'';$('#share').checked=own?.shared||false;$('#wrote').checked=!!editingDate;$('#wrote').required=!editingDate;$('#wrote').closest('label').hidden=!!editingDate;$('#checkin-dialog h2').textContent=editingDate?'Edit writing · '+dayLabel(target):'Daily check-in';$('#checkin-form button[type=submit]').textContent=editingDate?'Save changes':'I wrote today ✓';if(existingPhotoId){$('#selected-photo').src=own.photo;$('#photo-name').textContent='Saved photo';$('#photo-preview').hidden=false;}$('#draft-error').textContent='';$('#checkin-dialog').showModal();$('#draft').focus({preventScroll:true});}
function clearPhoto(){if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;photoFile=null;$('#photo').value='';$('#selected-photo').removeAttribute('src');$('#photo-preview').hidden=true;}
async function imageData(file){
 const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.82);if(data.length>3400000)throw Error('This photo is too large. Try a smaller photo or screenshot.');return data;}catch(error){if(error.message.includes('too large'))throw error;throw Error('This browser could not read that photo. Try a JPG or screenshot.');}finally{URL.revokeObjectURL(url);}}
$('#checkin-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;const text=$('#draft').value.trim();if($('#share').checked&&!text&&!existingPhotoId&&!(mode==='photo'&&photoFile)){$('#draft-error').textContent='Add writing or a photo, or turn off sharing.';return;}
 busy=true;const button=$('#checkin-form button[type=submit]');button.disabled=true;button.textContent='Saving…';
 try{let photoId=existingPhotoId;if(mode==='photo'&&photoFile){const image=await imageData(photoFile);const response=await fetch('/api/photo'+nextQuery,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,...(editingDate?{date:editingDate}:{})})});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not upload photo.');photoId=result.id;}
  const wasEditing=!!editingDate;const result=await api(wasEditing?'edit-writing':'checkin',{...(wasEditing?{date:editingDate}:{wrote:$('#wrote').checked}),content:{text,photoId,shared:$('#share').checked}});clearPhoto();$('#checkin-dialog').close();$('#checkin-form').reset();await refresh();if(!wasEditing&&!result.checkin.alreadyCompleted)celebrate();else toast('Your writing is updated.');
 }catch(error){$('#draft-error').textContent=error.message;}finally{busy=false;button.disabled=false;button.textContent=editingDate?'Save changes':'I wrote today ✓';}
});
function celebrate(){$('#celebration-date').textContent=dayLabel(model.today)+' · Saved to your account';$('#celebration-dialog').showModal();const layer=$('#confetti');layer.replaceChildren();if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<85;i++){const piece=el('span',undefined,'confetti-piece');piece.style.setProperty('--x',Math.random()*100+'vw');piece.style.setProperty('--drift',(Math.random()-.5)*200+'px');piece.style.setProperty('--turn',(Math.random()-.5)*1000+'deg');piece.style.setProperty('--delay',Math.random()*.7+'s');piece.style.background=['#25844f','#dfff00','#171815','#8ed4a9','#f2c75d'][i%5];layer.append(piece);piece.addEventListener('animationend',()=>piece.remove());}}
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>view(b.dataset.view));for(const id of ['#checkin-open','#sidebar-checkin','#share-open'])$(id).addEventListener('click',openCheckin);for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$('#'+b.dataset.close).close());$('#balance-open').addEventListener('click',()=>$('#balance-dialog').showModal());$('#search').addEventListener('input',renderFeed);$('#author-filter').addEventListener('change',renderFeed);$('#date-filter').addEventListener('change',renderFeed);$('#clear-writing-filters').addEventListener('click',clearWritingFilters);
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{mode=b.dataset.mode;$('#photo-field').hidden=mode!=='photo';$('#text-field').hidden=mode!=='text';for(const item of document.querySelectorAll('[data-mode]'))item.setAttribute('aria-pressed',String(item===b));});
$('#photo').addEventListener('change',()=>{const file=$('#photo').files[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>20*1024*1024){clearPhoto();$('#draft-error').textContent='Choose an image under 20 MB.';return;}if(photoUrl)URL.revokeObjectURL(photoUrl);photoFile=file;photoUrl=URL.createObjectURL(file);$('#selected-photo').src=photoUrl;$('#photo-name').textContent=file.name;$('#photo-preview').hidden=false;});$('#photo-remove').addEventListener('click',()=>{existingPhotoId=null;clearPhoto();});$('#celebration-dialog').addEventListener('close',()=>$('#confetti').replaceChildren());
let remindersActive=false;
function reminderState(){const email=$('#email-reminder').checked,evening=$('#evening-only').checked;$('#evening-only').disabled=!email;$('#reminder-state').textContent=!remindersActive?'Email reminders are not connected yet.':!email?'Email reminders are off.':evening?'You’ll get one email around 9 pm Pacific, only if you haven’t checked in. Text reminders are not connected.':'Email reminders are on around 9 am and 9 pm Pacific if you haven’t checked in. Text reminders are not connected.';}
for(const id of ['#email-reminder','#evening-only','#sms-reminder'])$(id).addEventListener('change',async()=>{reminderState();try{await api('preferences',{email:$('#email-reminder').checked,sms:$('#sms-reminder').checked,emailTiming:$('#evening-only').checked?'evening':'both'});toast('Reminder preferences saved.');}catch(error){toast(error.message);}});
for(const id of ['#logout','#footer-logout'])$(id).addEventListener('click',async()=>{try{await api('logout',{});location.replace('/challenge'+nextQuery);}catch(error){toast(error.message);}});refresh().then(loadRenewalEntry).catch(error=>{$('#app-error').textContent=error.message;});
let renewal;

function renderRenewalEntry(next){
 $('#founding-round-link').hidden=!(nextRound&&next.foundingEnrolled);
 $('#renewal-row').hidden=nextRound||!(next.canJoin||next.requested||next.enrolled);
 $('#round-link').hidden=!next.enrolled;
 const button=$('#renewal-open');
 button.hidden=next.enrolled;
 button.textContent=next.requested?'View request':'Enroll in next cohort?';
 const status=$('#renewal-row-status');
 if(next.enrolled)status.textContent='Enrolled';
 else if(next.paid)status.textContent='Stake confirmed · Enrollment pending';
 else if(next.requested)status.textContent=next.rollover?'Enrollment requested · Rollover pending':'Enrollment requested';
 else status.textContent='Use your current balance toward the next cohort.';
}

async function loadRenewalEntry(){
 try{
  renderRenewalEntry(await api('next-status'));
  if(location.hash==='#renewal'&&!$('#renewal-row').hidden&&!$('#renewal-open').hidden)openRenewal();
 }catch(error){toast(error.message);}
}

function renderQuote(){
 const {next,quote}=renewal;
 $('#rollover-quote').hidden=!quote;
 if(!quote)return;
 const useBalance=!quote.paidBack&&(next.requested?next.rollover:$('#rollover').checked);
 $('#rollover').disabled=quote.paidBack;
 if(quote.paidBack)$('#rollover').checked=false;
 $('#quote-heading').textContent=quote.paidBack?'Founding balance paid back · Start fresh':quote.estimated?'Estimated payment and payout':'Payment and payout';
 $('#quote-balance').textContent=money(quote.balanceCents);
 $('#quote-credit').textContent=money(useBalance?quote.rolloverCents:0);
 $('#quote-owed').textContent=money(useBalance?quote.owedCents:quote.stakeCents);
 $('#quote-payout').textContent=money(useBalance?quote.payoutCents:(quote.availableCents??quote.balanceCents));
}

function renderRenewal(){
 const {next}=renewal;
 renderRenewalEntry(next);
 const canSubmit=next.canJoin&&!next.requested;
 $('#renewal-form').hidden=!canSubmit;
 $('#join-next').hidden=!canSubmit;
 $('#renewal-status').textContent=next.enrolled?'You’re enrolled in the November cohort.':
  next.paid?'Raye confirmed your stake. Enrollment is pending.':
  next.requested?(next.paidBack?'Your founding balance was paid back. Send a fresh $150 on Venmo to @Raye-Schiller to re-enroll.':next.rollover?'Rollover requested. Raye will confirm your final balance and any Venmo top-up.':'Enrollment requested. Send $150 on Venmo to @Raye-Schiller.'):
  next.canJoin?'Choose how to fund your November stake.':'November enrollment is closed.';
 renderQuote();
}

async function openRenewal(){
 $('#renewal-status').textContent='Loading your balance…';
 $('#renewal-error').textContent='';
 $('#renewal-form').hidden=true;
 $('#join-next').hidden=true;
 $('#rollover-quote').hidden=true;
 $('#renewal-dialog').showModal();
 try{renewal=await api('renewal-status');renderRenewal();}
 catch(error){$('#renewal-status').textContent=error.message;}
}

$('#renewal-open').addEventListener('click',openRenewal);
$('#rollover').addEventListener('change',renderQuote);
$('#renewal-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=$('#join-next');
 const rollOver=$('#rollover').checked;
 button.disabled=true;
 $('#renewal-error').textContent='';
 try{
  const saved=await api('join-next',{rollover:rollOver});
  Object.assign(renewal.next,saved);
  renderRenewal();
 }catch(error){$('#renewal-error').textContent=error.message;}
 finally{button.disabled=false;}
});
// Full cohort reads are expensive; saves still refresh immediately above.
setInterval(()=>{if(!busy&&!document.hidden&&!document.querySelector('dialog[open]'))refresh().catch(()=>{});},15*60*1000);

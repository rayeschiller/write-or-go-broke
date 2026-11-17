const $=selector=>document.querySelector(selector);
const queryParams = new URLSearchParams(location.search);
const nextRound = queryParams.get('cohort') === 'november-2026';
const showExtensions = nextRound && queryParams.get('view') === 'extensions';
const activeRoster = showExtensions ? '#extension-requests-link' :
  nextRound ? '#november-roster-link' : '#founding-roster-link';
$(activeRoster).setAttribute('aria-current', 'page');

if (showExtensions) {
  $('#roster-title').textContent = 'Extension requests';
  $('#total-label').textContent = 'EXTENSION REQUESTS';
  $('#search').placeholder = 'Find a returning writer…';
}
if(nextRound){
  $('#admin-cohort-label').textContent='NOVEMBER COHORT / ADMIN';
  $('#enrolled-cohort').textContent='November cohort';
  $('#payment-total-label').textContent='STAKE CONFIRMED';
  $('#schedule-form').hidden=true;
  $('#payment-note').textContent='Confirm a $150 Venmo payment or record a reconciled rollover and any Venmo top-up, then enroll the writer. Check the founding payout before recording a rollover. These entries only track the November stake.';
}
let signups=[],filter='all',loading=false,scheduleVersion=null;
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const moneyExact=cents=>(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
function date(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function phone(value){return String(value).replace(/^\+1(\d{3})(\d{3})(\d{4})$/,'($1) $2-$3');}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function message(selector,text,error=false){const el=$(selector);el.textContent=text;el.className=text?(error?'status-error':'status-ok'):'';}
async function api(path,options={}){
  const scoped=nextRound&&path!=='/api/admin-session';
  const response=await fetch(scoped?path+(path.includes('?')?'&':'?')+'cohort=november-2026':path,{...options,credentials:'same-origin',cache:'no-store'});
  let data;try{data=await response.json();}catch{throw Error('Unexpected response. Please refresh and try again.');}
  if(response.status===401 && path!=='/api/admin-session'){showLogin();throw Error('Please sign in again.');}
  if(!response.ok)throw Error(data.error||'Could not complete that request. Try again.');
  return data;
}
function showLogin(){signups=[];$('#roster').replaceChildren();$('#dashboard').hidden=true;$('#login').hidden=false;$('#logout').hidden=true;}
function matchesPaymentFilter(person) {
  if (filter === 'paid') return person.paid;
  if (filter === 'unpaid') return !person.paid;
  if (filter === 'enrolled') return person.enrolled;
  return true;
}

function render() {
  const extensions = signups.filter(person => person.source === 'returning');
  const records = showExtensions ? extensions : signups;
  const paid = records.filter(person => person.paid).length;
  const pendingExtensions = extensions.filter(person => !person.enrolled).length;

  if (nextRound) {
    $('#extension-requests-link').textContent = 'Extension requests (' + pendingExtensions + ' pending)';
  }
  $('#total').textContent = records.length;
  $('#received').textContent = money(paid * 150);
  $('#paid-count').textContent = paid + (paid === 1 ? ' stake confirmed' : ' stakes confirmed');
  $('#unpaid').textContent = records.length - paid;
  $('#enrolled-count').textContent = records.filter(person => person.enrolled).length;

  const search = $('#search').value.trim().toLowerCase();
  const rows = records.filter(person => {
    const searchableFields = [person.name, person.email, person.phone, phone(person.phone)];
    return matchesPaymentFilter(person) && searchableFields.some(value =>
      String(value || '').toLowerCase().includes(search)
    );
  });

  const countLabel = showExtensions ? 'extension requests' : 'signups';
  $('#result-count').textContent = rows.length + ' of ' + records.length + ' ' + countLabel;
  const roster = $('#roster');
  roster.replaceChildren();
  if (!rows.length) {
    const emptyMessage = records.length ? 'No ' + countLabel + ' match this search or filter.' :
      'No ' + countLabel + ' yet.';
    roster.append(node('div', emptyMessage, 'empty-state'));
    return;
  }
  for(const person of rows){
    const row=node('article',undefined,'person');row.setAttribute('role','listitem');
    const contact=node('div');contact.append(node('h2',person.name));const links=node('div',undefined,'contact');
    const email=node('a',person.email);email.href='mailto:'+person.email;
    const tel=node('a',phone(person.phone));tel.href='tel:'+person.phone;links.append(email,tel);contact.append(links);
    const joined=node('div');joined.append(node('span',person.source==='returning'?'EXTENSION REQUESTED':'SIGNED UP','row-label'),node('span',date(person.createdAt),'signup-date'));
    const payment=node('div');payment.append(node('span','PAYMENT STATUS','row-label'),node('span',person.paid?(person.method==='rollover'?moneyExact(person.rolloverCents??15000)+' ROLLOVER':'$150 RECEIVED'):'NOT RECEIVED','badge'+(person.paid?' paid':'')));
    if (person.source === 'returning') {
      const requestedFunding = person.rollover ? 'Requested: balance rollover' :
        person.rollover === false ? 'Requested: Venmo payment' : 'Funding preference not specified';
      payment.append(node('div', requestedFunding, 'payment-date'));
    }
    if (person.paid && person.method === 'rollover') {
      const topUp = 15000 - (person.rolloverCents ?? 15000);
      payment.append(node('div', moneyExact(topUp) + ' Venmo top-up confirmed', 'payment-date'));
    }
    if(person.paidAt)payment.append(node('div','Marked '+date(person.paidAt),'payment-date'));
    payment.append(node('span',person.enrolled?'CHALLENGE: ENROLLED':person.paid?'READY TO ENROLL':'NOT ENROLLED','badge enrollment'+(person.enrolled?' paid':'')));
    if(person.enrolledAt)payment.append(node('div','Enrolled '+date(person.enrolledAt),'payment-date'));
    if(person.enrolled)payment.append(node('div',(person.completedDays||0)+' / 30 days written'+(person.lastCheckin?' · Latest '+person.lastCheckin:''),'payment-date'));
    const action=node('div');const button=node('button',person.paid?'Undo payment mark':'Mark $150 received','payment-action'+(person.paid?' undo':''));
    button.type='button';button.setAttribute('aria-label',(person.paid?'Undo payment for ':'Mark $150 Venmo received from ')+person.name);
    const funding=async method=>{
      let rolloverCents;
      if(method==='rollover'){
        const input=window.prompt('How much of this writer’s final founding balance are you applying? Enter dollars, up to $150.','150');
        if(input===null)return;
        rolloverCents=Math.round(Number(input.trim())*100);
        if(!/^\d+(\.\d{1,2})?$/.test(input.trim())||rolloverCents<1||rolloverCents>15000){
          message('#dashboard-status','Enter a rollover between $0.01 and $150.',true);return;
        }
        if(!window.confirm('Confirm '+moneyExact(rolloverCents)+' from the founding balance and '+moneyExact(15000-rolloverCents)+' received on Venmo.'))return;
      }
      for(const control of action.querySelectorAll('button'))control.disabled=true;row.classList.add('pending');button.textContent='Saving…';message('#dashboard-status','');
      try{
        const result=await api('/api/admin-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:person.id,paid:!person.paid,expectedVersion:person.paymentVersion,...(nextRound?{method,rolloverCents}:{})})});
        Object.assign(person,{method:result.payment.method,rolloverCents:result.payment.rolloverCents,paid:result.payment.paid,paidAt:result.payment.paidAt,enrolled:result.payment.enrolled,enrolledAt:result.payment.enrolledAt,cohortId:result.payment.cohortId,updatedAt:result.payment.updatedAt,paymentVersion:result.payment.paymentVersion});
        render();message('#dashboard-status',person.paid?'Confirmed the $150 stake for '+person.name+'.':'Payment mark removed for '+person.name+'. Challenge enrollment is also cleared.');
      }catch(error){message('#dashboard-status',error.message,true);for(const control of action.querySelectorAll('button'))control.disabled=false;row.classList.remove('pending');button.textContent=person.paid?'Undo payment mark':'Mark $150 received';}
    };
    button.addEventListener('click',()=>funding('venmo'));
    action.append(button);
    if(nextRound&&person.source==='returning'&&!person.paid){
      const rollover=node('button','Confirm rollover','payment-action');
      rollover.type='button';rollover.addEventListener('click',()=>funding('rollover'));action.append(rollover);
    }
    if(person.paid){
      const enroll=node('button',person.enrolled?'Undo enrollment':'Enroll in challenge','payment-action enroll'+(person.enrolled?' undo':''));
      enroll.type='button';enroll.setAttribute('aria-label',(person.enrolled?'Undo challenge enrollment for ':'Enroll in challenge: ')+person.name);
      enroll.addEventListener('click',async()=>{
        for(const control of action.querySelectorAll('button'))control.disabled=true;
        row.classList.add('pending');enroll.textContent='Saving…';message('#dashboard-status','');
        try{
          const result=await api('/api/admin-enrollment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:person.id,enrolled:!person.enrolled,expectedVersion:person.paymentVersion})});
          Object.assign(person,{paid:result.payment.paid,enrolled:result.payment.enrolled,enrolledAt:result.payment.enrolledAt,cohortId:result.payment.cohortId,updatedAt:result.payment.updatedAt,paymentVersion:result.payment.paymentVersion});
          render();message('#dashboard-status',person.enrolled?person.name+' is enrolled in this cohort.':'Challenge enrollment removed for '+person.name+'. Payment remains received.');
        }catch(error){render();message('#dashboard-status',error.message,true);}
      });
      action.prepend(enroll);
    }
    if(person.enrolled&&person.source!=='returning'){
      const invite=node('button','Create login / reset link','payment-action invite');invite.type='button';
      invite.addEventListener('click',async()=>{
        invite.disabled=true;invite.textContent='Creating link…';
        try{
          const result=await api('/api/participant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin-invite',id:person.id})});
          const panel=node('div',undefined,'invite-result');const info=node('p','Send this private, one-use link only to '+person.name+' at their signup contact. It expires in 72 hours.');
          const input=node('input');input.value=result.url;input.readOnly=true;input.setAttribute('aria-label','Private account setup link for '+person.name);
          const copy=node('button','Copy private link','secondary');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(input.value);copy.textContent='Copied ✓';}catch{input.focus();input.select();copy.textContent='Select and copy the link above';}});
          panel.append(info,input,copy);action.querySelector('.invite-result')?.remove();action.append(panel);invite.textContent='Create a fresh login link';
        }catch(error){message('#dashboard-status',error.message,true);invite.textContent='Create login / reset link';}
        finally{invite.disabled=false;}
      });action.append(invite);
    }
    if(person.enrolled){
      const edit=node('button','Edit check-ins','payment-action invite');edit.type='button';
      edit.addEventListener('click',async()=>{
        edit.disabled=true;
        try{const data=await api('/api/participant?action=admin-checkins&id='+person.id);action.querySelector('.checkin-editor')?.remove();
          const panel=node('form',undefined,'checkin-editor');const label=node('label','Challenge day');const select=node('select');select.setAttribute('aria-label','Challenge day for '+person.name);
          for(const day of data.dates){const option=new Option(day.date+' · '+(day.completed?'Checked in':'Not checked in'),day.date);option.disabled=!day.editable;select.append(option);}
          const opened=data.dates.filter(d=>d.editable);if(opened.length)select.value=opened.at(-1).date;
          const completeLabel=node('label');const completed=node('input');completed.type='checkbox';completeLabel.append(completed,document.createTextNode(' Completed at least 10 minutes'));
          const reason=node('input');reason.placeholder='Reason for correction';reason.maxLength=300;reason.required=true;reason.setAttribute('aria-label','Reason for check-in correction');
          const save=node('button','Save correction','secondary');save.type='submit';save.disabled=!opened.length;
          function sync(){completed.checked=data.dates.find(d=>d.date===select.value)?.completed||false;}select.addEventListener('change',sync);sync();
          panel.append(label,select,completeLabel,reason,save);action.append(panel);
          panel.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const day=data.dates.find(d=>d.date===select.value);await api('/api/participant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin-checkin',id:person.id,date:day.date,completed:completed.checked,expectedVersion:day.version,reason:reason.value})});await refresh();message('#dashboard-status','Check-in corrected for '+person.name+'. Balances update with the correction.');}catch(error){message('#dashboard-status',error.message,true);save.disabled=false;}});
        }catch(error){message('#dashboard-status',error.message,true);}finally{edit.disabled=false;}
      });action.append(edit);
    }
    row.append(contact,joined,payment,action);roster.append(row);
  }
}
async function refresh(){
  if(loading)return;loading=true;$('#refresh').disabled=true;message('#dashboard-status','');
  try{
    const data=await api('/api/admin-signups');signups=data.signups;
    $('#login').hidden=true;$('#dashboard').hidden=false;$('#logout').hidden=false;render();
    await loadSchedule();
    $('#sync-time').textContent='Updated '+new Date().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  }catch(error){message($('#dashboard').hidden?'#login-status':'#dashboard-status',error.message,true);}
  finally{loading=false;$('#refresh').disabled=false;}
}
async function login(key){
  const button=$('#login-form button');button.disabled=true;$('#login-status').textContent='Signing in…';
  try{await api('/api/admin-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});$('#access-key').value='';message('#login-status','');await refresh();}
  catch(error){message('#login-status',error.message,true);}
  finally{button.disabled=false;}
}
$('#login-form').addEventListener('submit',event=>{event.preventDefault();login($('#access-key').value.trim());});
$('#logout').addEventListener('click',async()=>{try{await api('/api/admin-session',{method:'DELETE'});showLogin();message('#login-status','Signed out.');}catch(error){message('#dashboard-status',error.message,true);}});
$('#refresh').addEventListener('click',refresh);$('#search').addEventListener('input',render);
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{filter=button.dataset.filter;for(const item of document.querySelectorAll('[data-filter]'))item.setAttribute('aria-pressed',String(item===button));render();});
const params=new URLSearchParams(location.hash.slice(1));const key=params.get('key');
if(key){history.replaceState(null,'',location.pathname+location.search);login(key);}
else refresh();

async function loadSchedule(){
 try{const result=await api('/api/participant?action=admin-settings');const schedule=result.settings;scheduleVersion=schedule.version;
 if(schedule.startDate)$('#start-date').value=schedule.startDate;$('#timezone').value=schedule.timezone||'';
 $('#schedule-status').textContent=schedule.startDate?schedule.startDate+' · Midnight '+schedule.timezone:'Choose a timezone and save the October 19 start before participants can check in.';
 }catch(error){message('#schedule-status',error.message,true);}
}
$('#schedule-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('#schedule-form button');button.disabled=true;
 try{await api('/api/participant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin-settings',startDate:$('#start-date').value,timezone:$('#timezone').value,expectedVersion:scheduleVersion})});await loadSchedule();}
 catch(error){message('#schedule-status',error.message,true);}finally{button.disabled=false;}
});

$('#finance-refresh').addEventListener('click',loadFinances);
async function loadFinances(){
 const button=$('#finance-refresh');button.disabled=true;message('#finance-status','');
 try{
  const finance=await api('/api/participant?action=admin-finances');const records=$('#finance-records');records.replaceChildren();
  if(finance.unallocatedCents)message('#finance-status','Unallocated pools: '+money(finance.unallocatedCents/100)+'. No one checked in on those days. Payouts stay blocked until resolved.',true);
  for(const person of finance.records){
   const row=node('div',undefined,'finance-row');const info=node('div');info.append(node('strong',person.name),node('p','Return: '+(person.projectedCents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})+' · Lost '+money(person.lostCents/100)+' · Earned '+(person.earnedCents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})));
   const mark=node('button',person.payout?.sent?'Undo payout mark':'Mark Venmo payout sent','secondary');mark.disabled=finance.phase!=='ended'||finance.unallocatedCents>0;
   mark.addEventListener('click',async()=>{mark.disabled=true;try{await api('/api/participant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin-payout',id:person.id,amountCents:person.projectedCents,sent:!person.payout?.sent,expectedVersion:person.payoutVersion})});await loadFinances();}catch(error){message('#finance-status',error.message,true);mark.disabled=false;}});
   row.append(info,mark);records.append(row);
  }
  if(finance.phase!=='ended'&&!finance.unallocatedCents)message('#finance-status','Projected balances. Final payouts open after the challenge ends.');
 }catch(error){message('#finance-status',error.message,true);}finally{button.disabled=false;}
}

const $=s=>document.querySelector(s);let model=null,busy=false;
const params=new URLSearchParams(location.hash.slice(1));let setup=params.get('setup'),access=params.get('token');
if(setup||access)history.replaceState(null,'',location.pathname+location.search);
function message(selector,text,error=false){const e=$(selector);e.textContent=text;e.className=text?(error?'error':'notice'):'';}
async function api(data){
 const r=await fetch('/api/participant',{...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{}),credentials:'same-origin',cache:'no-store'});
 let result;try{result=await r.json();}catch{throw Error('Could not connect. Please refresh and try again.');}
 if(!r.ok){const e=Error(result.error||'Could not complete the request.');e.status=r.status;throw e;}return result;
}
function loginView(){if(!setup){$('#identifier-field').hidden=false;$('#identifier').required=true;$('#confirm-field').hidden=true;$('#confirm-password').required=false;$('#login-title').innerHTML='Your writing<br>era awaits.';$('#login-intro').textContent='Use the email or phone number from your signup and your password.';$('#password-label').textContent='PASSWORD';$('#password').autocomplete='current-password';$('#login-button').textContent='LET’S WRITE ↗';$('#setup-help').textContent='First time here or forgot your password? Ask Raye for your private setup link.';}model=null;$('#challenge-panel').hidden=true;$('#login-panel').hidden=false;$('#logout').hidden=true;$('#calendar').replaceChildren();}
function dayLabel(value){const [year,month,day]=value.split('-');return new Date(Date.UTC(+year,+month-1,+day)).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});}
function render(){
 if(model.enrolled&&model.paid){location.replace('/cohort');return;}
 $('#login-panel').hidden=true;$('#challenge-panel').hidden=false;$('#logout').hidden=false;
 $('#greeting').textContent=model.person.name.toUpperCase()+' / FOUNDING COHORT';
 $('#schedule').textContent=model.schedule.startDate?dayLabel(model.schedule.startDate)+' – '+dayLabel(model.endDate)+' · Daily deadline: midnight '+model.schedule.timezone:'Challenge schedule is being confirmed.';
 const done=new Set(model.completed.map(c=>c.date));const todayDone=done.has(model.today);
 $('#completed-count').textContent=model.completed.length+' / 30';$('#protected-stake').textContent='$'+model.completed.length*5;
 const active=model.phase==='active'&&model.enrolled&&model.paid;
 $('#checkin-form').hidden=!active||todayDone;$('#checkin-card').classList.toggle('done',todayDone);
 $('#day-label').textContent=model.day?'DAY '+model.day+' OF 30':'YOUR CHALLENGE';
 $('#checkin-title').textContent=todayDone?'Look at you showing up. See you tomorrow.':model.phase==='ended'?'Thirty days. Look at you.':active?'Ten little minutes. You’ve got this.':'Your next chapter is waiting.';
 $('#deadline').textContent=todayDone?'Your '+dayLabel(model.today)+' check-in is saved.':active?'Check in before midnight in '+model.schedule.timezone+'. Check-ins apply to today only.':'';
 let notice='';
 if(!model.enrolled||!model.paid)notice='Your signup is linked. Raye needs to confirm your payment and enroll you before you can check in.';
 else if(model.phase==='unconfigured')notice='You’re enrolled. The shared start date and timezone will appear here once confirmed.';
 else if(model.phase==='upcoming')notice='You’re enrolled. Everyone starts on '+dayLabel(model.schedule.startDate)+'. Come back then for day one.';
 else if(model.phase==='ended')notice='This 30-day challenge has ended. Your saved writing record is below.';
 message('#notice',notice);$('#wrote').checked=false;
 const calendar=$('#calendar');calendar.replaceChildren();
 for(const [i,date] of model.dates.entries()){
  const state=done.has(date)?'done':date===model.today?'today':date<model.today?'missed':'upcoming';
  const cell=document.createElement('div');cell.className='day '+state;cell.setAttribute('role','listitem');
  const label=document.createElement('strong');label.textContent='DAY '+(i+1)+(state==='done'?' ✓':'');
  const when=document.createElement('span');when.textContent=dayLabel(date);
  const status=document.createElement('span');status.textContent=state==='done'?'WRITING SAVED':state==='today'?'TODAY':state==='missed'?'NO CHECK-IN':'UPCOMING';cell.append(label,when,status);calendar.append(cell);
 }
}
async function refresh(){try{model=await api();render();}catch(e){if(e.status===401)loginView();else message(model?'#checkin-status':'#login-status',e.message,true);}}
$('#login-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const password=$('#password').value;
 if(setup&&password!==$('#confirm-password').value){message('#login-status','Passwords do not match.',true);return;}
 busy=true;$('#login-button').disabled=true;message('#login-status','Signing in…');
 try{await api(setup?{action:'activate',id:setup,token:access,password}:{action:'login',identifier:$('#identifier').value,password});setup=access=null;$('#password').value='';$('#confirm-password').value='';message('#login-status','');await refresh();}
 catch(e){message('#login-status',e.message,true);}finally{busy=false;$('#login-button').disabled=false;}
});
$('#checkin-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;const button=$('#checkin-form button');button.disabled=true;message('#checkin-status','Saving your check-in…');
 try{await api({action:'checkin',wrote:$('#wrote').checked});await refresh();message('#checkin-status','Check-in saved. You protected today’s $5.');$('#checkin-card').scrollIntoView({block:'center',behavior:'smooth'});}
 catch(e){message('#checkin-status',e.message,true);}finally{busy=false;button.disabled=false;}
});
$('#logout').addEventListener('click',async()=>{try{await api({action:'logout'});loginView();message('#login-status','Signed out.');}catch(e){message('#checkin-status',e.message,true);}});
$('#refresh').addEventListener('click',refresh);
if(setup&&access){$('#login-title').textContent='YOUR ACCOUNT. YOUR COMMITMENT.';$('#login-intro').textContent='Your private link connects this account to your existing signup. Create a password, then log in with either signup email or phone.';$('#identifier-field').hidden=true;$('#identifier').required=false;$('#password').autocomplete='new-password';$('#password-label').textContent='CREATE PASSWORD (10+ CHARACTERS)';$('#confirm-field').hidden=false;$('#confirm-password').required=true;$('#login-button').textContent='CREATE MY LOGIN ↗';$('#setup-help').textContent='This setup link expires after 72 hours and can be used once.';}
else refresh();

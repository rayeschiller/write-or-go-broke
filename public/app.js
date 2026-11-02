const signup=document.querySelector('#signup');
function normalizePhone(value){
  if(!/^\+?[\d\s().-]+$/.test(value.trim()))return '';
  let digits=value.replace(/\D/g,'');
  if(digits.length===11 && digits.startsWith('1'))digits=digits.slice(1);
  return /^[2-9]\d{9}$/.test(digits)?'+1'+digits:'';
}
signup.addEventListener('submit',async event=>{
  event.preventDefault();
  const status=document.querySelector('#form-status'),button=signup.querySelector('button');
  const data=Object.fromEntries(new FormData(signup));
  data.phone=normalizePhone(data.phone);
  if(!data.phone){status.textContent='Enter your 10-digit US phone number.';document.querySelector('#phone').focus();return;}
  data.consent=signup.elements.consent.checked;data.sms=signup.elements.sms.checked;
  button.disabled=true;signup.setAttribute('aria-busy','true');status.dataset.state='pending';status.textContent='Saving your spot…';
  try{const response=await fetch('/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save your spot. Please try again.');signup.innerHTML='<div class="signup-success" tabindex="-1"><span class="success-check" aria-hidden="true">✓</span><div class="section-label">SIGNUP SAVED</div><h3>You’re on<br>the list.</h3><p>Your signup is saved. <strong>The cohort started October 19.</strong> Get your payment and account setup sorted so you can check in.</p><p class="venmo-next">Venmo <a href="https://venmo.com/Raye-Schiller" target="_blank" rel="noopener noreferrer">@Raye-Schiller</a> to secure your spot.</p><p class="micro">$150 FOR THE 30-DAY COMMITMENT.</p><p>After payment, ask Raye for your private account setup link. Then you can log in with your signup email or phone.</p></div>';const success=signup.querySelector('.signup-success');document.activeElement?.blur();success.focus({preventScroll:true});success.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});}
  catch(error){status.dataset.state='error';status.setAttribute('role','alert');status.textContent=error.message==='Failed to fetch'?'Connection interrupted. Please try again.':error.message;status.scrollIntoView({block:'nearest'});}
  finally{button.disabled=false;signup.removeAttribute('aria-busy');}
});
document.querySelector('#remove').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,status=document.querySelector('#remove-status'),button=form.querySelector('button');button.disabled=true;
  try{const data=Object.fromEntries(new FormData(form));data.phone=normalizePhone(data.phone);if(!data.phone){status.textContent='Enter your 10-digit US phone number.';document.querySelector('#remove-phone').focus();return;}const response=await fetch('/api/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!response.ok)throw Error('Could not process your request. Please try again.');status.textContent='If those details matched a signup, it has been removed.';form.reset();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});

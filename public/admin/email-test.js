const button=document.querySelector('#send-test'),status=document.querySelector('#test-status');
fetch('/api/admin-email',{credentials:'same-origin',cache:'no-store'}).then(async response=>{
 if(!response.ok)throw Error('Sign in to admin first, then return here.');
 const config=await response.json();if(!config.configured)throw Error('Email service is not configured.');
 button.disabled=false;status.textContent='Ready to send a test to rayeschiller@gmail.com.';
}).catch(error=>status.textContent=error.message);
button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='Sending…';
 try{
  const response=await fetch('/api/admin-email',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({template:'welcome'})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Could not send the test.');
  status.textContent='Test sent to '+result.to+'. Subject: [Test] Welcome to the cohort.';
 }catch(error){status.textContent=error.message;button.disabled=false;}
});

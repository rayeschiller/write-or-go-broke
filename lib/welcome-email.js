const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function welcomeEmail({name,url,setup}){
 const subject='Welcome to the cohort';
 const intro=setup?'Your spot is confirmed. Use your private link below to set up your password.':'Your spot is confirmed. Use your existing email and password to log in below.';
 const help=setup?'This private link can be used once and expires in 72 hours. Please don’t share it.':'Your existing login still works for this cohort.';
 const label=setup?'Set up your account':'Open your cohort';
 const text=`Welcome to the cohort\n\nHey ${name},\n\n${intro}\n\n${label}: ${url}\n\n${help}\n\nWrite for at least 10 minutes, then check in each day to protect your $5.\n\nSee you in there!\nRaye`;
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff9f2;color:#203e8a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><div style="max-width:520px;text-align:left;border:1px solid #b6c1df;background:#fffdfb"><div style="padding:20px 24px;background:#f0b9c6;font-size:20px;font-weight:bold">WRITE OR GO BROKE *</div><div style="padding:28px 24px"><h1 style="font-size:30px;margin:0 0 24px">Welcome to the cohort</h1><p>Hey ${escape(name)},</p><p style="line-height:1.7">${intro}</p><p style="margin:28px 0"><a href="${escape(url)}" style="display:inline-block;background:#294eaa;color:#fff;padding:16px 22px;text-decoration:none;font-weight:bold">${label}</a></p><p style="font-size:13px;line-height:1.6;color:#596b91">${help}</p><p style="line-height:1.7">Write for at least 10 minutes, then check in each day to protect your $5.</p><p style="line-height:1.7">See you in there!<br>Raye</p></div></div></td></tr></table></body></html>`;
 return {subject,text,html};
}

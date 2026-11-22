export function passwordResetEmail(url){
  const subject='Reset your Write or Go Broke password';
  const intro='Use the link below to choose a new password for your account.';
  const expiry='This link expires in one hour and works once.';
  const help='If you didn’t request a reset, you can ignore this email.';
  const text=`Reset your password.\n\n${intro}\n\n${url}\n\n${expiry} ${help}`;
  const href=url.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const html=`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;background-color:#fff9f2;color:#203e8a;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#fff9f2">
    <tr><td align="center" style="padding:28px 16px">
      <!--[if mso]><table role="presentation" width="540" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;background-color:#fffdfa;border:1px solid #203e8a;box-shadow:5px 6px 0 #f0b9c6;text-align:left">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #b5bfd7;font-size:20px;line-height:1.2;font-weight:bold">
          WRITE OR<br><span style="background-color:#f0b9c6;font:20px 'Courier New',monospace;padding:1px 4px">GO BROKE *</span>
        </td></tr>
        <tr><td style="padding:28px 24px">
          <h1 style="margin:0 0 18px;font-size:34px;line-height:1.25;letter-spacing:-1px">Reset your <span style="display:inline-block;background-color:#f0b9c6;font-family:'Courier New',monospace;font-weight:normal;padding:0 5px">password.</span></h1>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.6">${intro}</p>
          <table role="presentation" cellspacing="0" cellpadding="0">
            <tr><td bgcolor="#284eae" style="border:1px solid #203e8a;border-radius:3px;box-shadow:2px 3px 0 #203e8a;mso-padding-alt:14px 20px">
              <a href="${href}" style="display:inline-block;padding:14px 20px;color:#fffdfa;font:bold 14px/1.4 'Courier New',monospace;text-decoration:none;mso-padding-alt:0">RESET PASSWORD</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;color:#596783;font-size:14px;line-height:1.6">${expiry}<br>${help}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
  return {subject,text,html};
}

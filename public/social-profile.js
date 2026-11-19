// Shared by signup UI and API so both accept the same profile links.
const instagramPages=new Set(['p','reel','reels','stories','explore','accounts','direct','about','developer','developers','legal','privacy','terms','web','challenge','oauth']);
export function normalizeSocialProfile(value){
  if(typeof value!=='string')return null;
  const input=value.trim();
  if(!input||input.length>500||/[\s\\]/.test(input))return null;
  let url;
  try{url=new URL(/^https?:\/\//i.test(input)?input:'https://'+input);}catch{return null;}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)return null;
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  if(host==='instagram.com'){
    const match=url.pathname.match(/^\/([a-zA-Z0-9_.]{1,30})\/?$/);
    if(!match||instagramPages.has(match[1].toLowerCase())||match[1].startsWith('.')||match[1].endsWith('.')||match[1].includes('..'))return null;
    return 'https://www.instagram.com/'+match[1]+'/';
  }
  if(host==='tiktok.com'){
    const match=url.pathname.match(/^\/@([a-zA-Z0-9_.]{2,24})\/?$/);
    if(!match||match[1].endsWith('.'))return null;
    return 'https://www.tiktok.com/@'+match[1];
  }
  return null;
}

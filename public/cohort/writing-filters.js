const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filterWriting(posts,{author='all',date='',query=''}={}){
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
 return posts.filter(post=>(author==='all'||post.author===author)&&(!date||post.date===date)&&terms.every(term=>normalize(post.name+' '+post.text).includes(term))).sort((a,b)=>b.date.localeCompare(a.date)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}

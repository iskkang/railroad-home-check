import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const assetVersion='20261110-shell1';
export function applySiteShell(html){
  if(!/<header\b/.test(html))return html;
  const canonical=html.match(/rel="canonical" href="([^"]+)"/)?.[1]||'';
  const path=canonical?new URL(canonical).pathname:'/';
  const home=path==='/';
  const nav=[['/', 'Check address'],['/trains/','Cities'],['/blog/','News'],['/guides/','Guides'],['/home-surroundings-data/','Data &amp; coverage'],['/about/','About']];
  const links=nav.map(([url,label])=>`<a href="${url==='/'?(home?'#searchForm':'/#searchForm'):url}"${url==='/'?home?' aria-current="page"':'':path.startsWith(url)?' aria-current="page"':''}>${label}</a>`).join('');
  const header=`<header class="site-header app-header"><a class="brand app-brand" href="/" aria-label="Home Surroundings Check home"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M5 18 20 6l15 12M10 16v18h20V16M16 34V23h8v11" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Home Surroundings Check</span></a><nav class="app-nav" aria-label="Main">${links}</nav></header>`;
  html=html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/,header);
  html=html.replace(/<link\b[^>]*href="\/site-shell\.css[^\"]*"[^>]*>\s*/g,'');
  html=html.replace('</head>',`<link rel="stylesheet" href="/site-shell.css?v=${assetVersion}"></head>`);
  if(home)return html.replace('<section class="hero"','<section class="hero app-hero"');
  return html.replace(/(<section\b[^>]*class=")([^\"]*(?:guide-hero|rc-hero|post-head)[^\"]*)("[^>]*>)([\s\S]*?)(<\/section>)/g,(_,a,classes,c,body,end)=>{
    let feature='';
    if(classes.includes('post-head')){
      body=body.replace(/<figure class="post-feature">[\s\S]*?<\/figure>/,match=>{feature=match;return '';});
      if(!body.includes('gv-search')) body=body.replace('</div>', '<form class="gv-search" action="/" role="search"><label for="shell-addr">Check a U.S. property address</label><input id="shell-addr" name="address" type="text" autocomplete="street-address" placeholder="Street address, city, state and ZIP" required><button type="submit">Check this address</button></form><p class="app-hero-credit">Illustrative AI-generated landscape · not a photo of the searched property</p></div>');
      if(!body.includes('app-post-photo'))body='<img class="app-post-photo" src="/assets/surroundings-hero.webp" alt="" fetchpriority="high"><div class="gv-shade" aria-hidden="true"></div>'+body;
    }
    body=body.replace(/(<img\b[^>]*class="(?:gv-photo|rc-photo)"[^>]*src=")[^\"]+/, '$1/assets/surroundings-hero.webp');
    body=body.replace(/<p class="(?:gv-credit|rc-credit)">[\s\S]*?<\/p>/g,'<p class="app-hero-credit">Illustrative AI-generated landscape · not a photo of the searched property</p>');
    return a+classes.replace(/\s*app-hero\b/g,'')+' app-hero'+c+body+end+(feature?'<div class="app-article-image">'+feature+'</div>':'');
  });
}
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name.startsWith('.')||['node_modules','vendor'].includes(entry.name))continue;const p=resolve(dir,entry.name);if(entry.isDirectory())await walk(p);else if(entry.name.endsWith('.html')){const before=await readFile(p,'utf8'),after=applySiteShell(before);if(before!==after){await writeFile(p,after);changed.push(relative(root,p));}}}}
const changed=[];
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){await walk(root);console.log(`Updated shared header and hero on ${changed.length} pages.`);}

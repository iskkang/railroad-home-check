import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const priorityCityEntries = { '/trains/fort-worth-tx/': 'Fort Worth', '/trains/laredo-tx/': 'Laredo' };
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
  const entryPaths = ['/', '/how-many-trains-pass-near-my-house/', '/blog/nashville-bna-flight-path-noise-2026/', '/trains/nashville-tn/', '/trains/grand-junction-co/'];
  if (entryPaths.includes(path) || Object.hasOwn(priorityCityEntries, path)) {
    if (!html.includes('/mobile-entry.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/mobile-entry.css?v=20261118-entry"><script src="/mobile-entry.js?v=20261118-entry" defer></script></head>');
    if (path === '/blog/nashville-bna-flight-path-noise-2026/' && !html.includes('entry-checker-wrap')) {
      const cta = html.match(/<div class="guide-cta">[\s\S]*?<\/form><\/div>/)?.[0];
      if (cta) html = html.replace(cta, '').replace('<section class="guide-shell">', '<section class="entry-checker-wrap">' + cta.replace('class="guide-cta"', 'class="guide-cta entry-checker"') + '</section><section class="guide-shell">');
    }
  }
  if(home)return html.replace('<section class="hero"','<section class="hero app-hero"');
  html = html.replace(/(<section\b[^>]*class=")([^\"]*(?:guide-hero|rc-hero|post-head)[^\"]*)("[^>]*>)([\s\S]*?)(<\/section>)/g,(_,a,classes,c,body,end)=>{
    let feature='';
    if(classes.includes('post-head')){
      body=body.replace(/<figure class="post-feature">[\s\S]*?<\/figure>/,match=>{feature=match;return '';});
      if(!body.includes('app-hero-credit')) body=body.replace('</div>', '<p class="app-hero-credit">Illustrative AI-generated landscape · not a photo of the searched property</p></div>');
      if(!body.includes('app-post-photo'))body='<img class="app-post-photo" src="/assets/surroundings-hero.webp" alt="" fetchpriority="high"><div class="gv-shade" aria-hidden="true"></div>'+body;
    }
    body=body.replace(/(<img\b[^>]*class="(?:gv-photo|rc-photo)"[^>]*src=")[^\"]+/, '$1/assets/surroundings-hero.webp');
    body=body.replace(/<p class="(?:gv-credit|rc-credit)">[\s\S]*?<\/p>/g,'<p class="app-hero-credit">Illustrative AI-generated landscape · not a photo of the searched property</p>');
    body=body.replace(/<form\b[^>]*>[\s\S]*?<\/form>/g,'');
    return a+classes.replace(/\s*app-hero\b/g,'')+' app-hero'+c+body+end+(feature?'<div class="app-article-image">'+feature+'</div>':'');
  });
  return finalizeEntry(html, path);
}
function finalizeEntry(html, path) {
  const priorityCity = priorityCityEntries[path];
  if (priorityCity) {
    if (!html.includes('class="entry-checker city-quick-entry"')) {
      const entry = `<section class="entry-checker-wrap"><div class="entry-checker city-quick-entry"><h2>Check a home in ${priorityCity}</h2><p>See nearby railroad crossings, reported night trains and road traffic for the address you’re considering.</p><form class="rc-search" action="/" role="search"><label for="addr-top">Full U.S. property address</label><input id="addr-top" type="text" autocomplete="street-address" maxlength="250" placeholder="Street address, city, state and ZIP" required><button type="submit">Check this address</button></form></div></section>`;
      html = html.replace(/(<section[^>]*class="[^"]*rc-hero[^"]*"[^>]*>[\s\S]*?<\/section>)/, '$1' + entry);
    }
    if (!html.includes('class="city-check-jump"')) {
      html = html.replace(/(<div class="rc-hero-main">[\s\S]*?<\/h1>)/, '$1<p><a class="city-check-jump" href="#addr-top" style="display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:8px;background:#fff;color:#163969;font-weight:800;text-decoration:underline">Check a property address ↓</a></p>');
    }
    if (!html.includes('/guide-analytics.js')) html = html.replace('</head>', '<script src="/guide-analytics.js?v=20261126-city-entry" defer></script></head>');
    html = html.replace("      track();\n      location.href =", "      if (window.GuideJourney) window.GuideJourney.mark(); else track();\n      location.href =");
    html = html.replace("  document.querySelectorAll('a.rc-cta-link').forEach(function(a){ a.addEventListener('click', track); });", "");
    const shellCss = `<link rel="stylesheet" href="/site-shell.css?v=${assetVersion}">`;
    html = html.replace(shellCss, '').replace('</head>', shellCss + '</head>');
  }
  const cities = {'/trains/nashville-tn/':'Nashville', '/trains/grand-junction-co/':'Grand Junction'};
  const city = cities[path];
  if (city && !html.includes('entry-checker-wrap')) {
    const entry = `<section class="entry-checker-wrap"><div class="entry-checker"><h2>Checking a home in ${city}?</h2><p>The city map is a starting point. Check the property's nearby rail activity and road traffic using public records.</p><form class="rc-search" action="/" role="search"><label for="addr-top">Full U.S. property address</label><input id="addr-top" name="address" type="text" autocomplete="street-address" maxlength="250" placeholder="Street address, city, state and ZIP" required><button type="submit">Check this home</button></form></div></section>`;
    html = html.replace(/(<section[^>]*class="[^"]*rc-hero[^"]*"[^>]*>[\s\S]*?<\/section>)/, '$1' + entry);
  }
  if (path === '/blog/nashville-bna-flight-path-noise-2026/') {
    const entry = html.match(/<section class="entry-checker-wrap">[\s\S]*?<\/section>/)?.[0];
    if (entry && html.includes('<div class="app-article-image">')) html = html.replace(entry, '').replace('<div class="app-article-image">', entry + '<div class="app-article-image">');
  }
  return html;
}
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name.startsWith('.')||['node_modules','vendor'].includes(entry.name))continue;const p=resolve(dir,entry.name);if(entry.isDirectory())await walk(p);else if(entry.name.endsWith('.html')){const before=await readFile(p,'utf8'),after=applySiteShell(before);if(before!==after){await writeFile(p,after);changed.push(relative(root,p));}}}}
const changed=[];
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){await walk(root);console.log(`Updated shared header and hero on ${changed.length} pages.`);}

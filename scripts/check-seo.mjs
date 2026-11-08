import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://railroad-home-check.vercel.app';
const read = p => readFile(resolve(root, p), 'utf8');
const sitemap = await read('sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => x[1]);
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
check(urls.length === new Set(urls).size, 'Duplicate sitemap URLs');
const pages = new Map();
const titles = new Set();
const descriptions = new Set();

for (const url of urls) {
  const parsed = new URL(url);
  check(parsed.origin === origin, `Unexpected sitemap origin: ${url}`);
  const path = parsed.pathname;
  const file = path === '/' ? 'index.html' : path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
  const source = await read(file);
  pages.set(path, source);
  const title = source.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  const description = source.match(/<meta name="description" content="([^"]+)"/i)?.[1];
  const canonical = source.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  check(title && !titles.has(title), `Missing or duplicate title: ${path}`);
  check(description && !descriptions.has(description), `Missing or duplicate description: ${path}`);
  titles.add(title); descriptions.add(description);
  check(canonical === url, `Canonical differs from sitemap: ${path}`);
  check((source.match(/<h1(?:\s[^>]*)?>/gi) || []).length === 1, `Expected one H1: ${path}`);
  check(!/<meta[^>]+content="[^"]*noindex/i.test(source), `Indexed page has noindex: ${path}`);
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
  check(ids.length === new Set(ids).size, `Duplicate element IDs: ${path}`);
  for (const script of source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(script[1]); } catch { errors.push(`Invalid JSON-LD: ${path}`); }
  }
}

const edges = new Map();
for (const [path, source] of pages) {
  const links = [...source.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map(x => x[1]);
  const targets = [];
  for (const href of links) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const target = new URL(href, origin).pathname;
    const file = target === '/' ? 'index.html' : target.endsWith('/') ? `${target.slice(1)}index.html` : target.slice(1);
    try { await access(resolve(root, file)); } catch { errors.push(`Broken internal link: ${path} -> ${target}`); }
    if (pages.has(target)) targets.push(target);
  }
  edges.set(path, targets);
}
const reachable = new Set(['/']);
const queue = ['/'];
while (queue.length) {
  for (const target of edges.get(queue.shift()) || []) {
    if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
  }
}
for (const path of pages.keys()) check(reachable.has(path), `Orphan sitemap page: ${path}`);
const robots = await read('robots.txt');
check(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'Sitemap missing from robots.txt');
check(!/^Disallow:\s*\/\s*$/m.test(robots), 'robots.txt blocks the whole site');
check(!/Railroad Home Check/.test(await read('index.html')), 'Old homepage brand');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`SEO checks passed: ${pages.size} indexable pages; unique metadata, valid JSON-LD, canonical URLs, internal links and homepage reachability.`);
}

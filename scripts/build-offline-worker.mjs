import { readdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root=process.argv[2]||'dist',base=process.argv[3]||'/';
if(!base.startsWith('/')||!base.endsWith('/'))throw Error('Invalid application base');
const html=await readFile(join(root,'index.html'),'utf8'),assets=(await readdir(join(root,'assets'))).filter(name=>/\.(js|css|woff2)$/.test(name));
const version=createHash('sha256').update(html).digest('hex').slice(0,16),cache=`berry-static-${version}`;
const urls=[base,...assets.map(name=>`${base}assets/${name}`),`${base}favicon.svg`,`${base}templates/inspection.xlsx`,`${base}brand/hortifrut-compact.png`,`${base}brand/hortifrut.svg`,`${base}fonts/report/LiberationSans-Regular.ttf`,`${base}fonts/report/LiberationSans-Bold.ttf`];
const source=`const CACHE=${JSON.stringify(cache)},BASE=${JSON.stringify(base)},FILES=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('berry-static-')&&key!==CACHE).slice(0,-1).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE)||url.pathname.includes('/api/')||url.pathname.includes('/auth/'))return;
if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match(BASE)).then(response=>response||Response.error())));return;}
if(FILES.includes(url.pathname)||url.pathname.startsWith(BASE+'assets/'))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request,{ignoreSearch:true}))||(await caches.match(event.request,{ignoreSearch:true}))||fetch(event.request)));});
`;
await writeFile(join(root,'sw.js'),source);
console.log(`Offline shell: ${assets.length} assets, version ${version}`);

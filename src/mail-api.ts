export function mailEndpoint(path:string) {
  const configured=import.meta.env.VITE_MAKE_TEST_API_URL?.trim();
  if(!configured)return import.meta.env.DEV?path:'';
  try{
    const url=new URL(configured,window.location.origin);
    if(url.username || url.password || url.search || url.hash || /(^|\.)make\.com$/i.test(url.hostname) || url.pathname!=='/api/integrations/make/test')return '';
    if(url.protocol!=='https:' && !(import.meta.env.DEV && url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))return '';
    url.pathname=path;return url.href;
  }catch{return '';}
}

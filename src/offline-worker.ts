import { hasPendingChanges } from './manual-save';
let waiting: ServiceWorkerRegistration | null = null;
export const pendingOfflineUpdate = () => waiting;
export function registerOfflineSupport(){
 if(!('serviceWorker' in navigator)||import.meta.env.DEV)return;
 window.addEventListener('load',()=>{
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL,updateViaCache:'none'}).then(registration=>{
   const announce=()=>{if(registration.waiting){waiting=registration;window.dispatchEvent(new CustomEvent('berry-update-ready',{detail:registration}));}};announce();
   registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',announce));
   let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing||hasPendingChanges()||sessionStorage.getItem('berry-activate-update')!=='true')return;refreshing=true;sessionStorage.removeItem('berry-activate-update');location.reload();});
  }).catch(()=>{/* The online application remains usable when offline installation is unavailable. */});
 });
}

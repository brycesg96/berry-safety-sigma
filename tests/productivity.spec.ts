import { test, expect } from './test-fixture';

async function seed(page:import('@playwright/test').Page){
 await page.route('**/api/people?*',r=>r.fulfill({json:{people:[]}}));await page.goto('./');
 return page.evaluate(async()=>{
  const {newInspection,newObservation,persistInspection}=await import('/src/model.ts');const {limaToday}=await import('/src/inspection-priority.ts');
  const date=limaToday(),day=(offset:number)=>new Date(Date.parse(date+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10),ids:string[]=[];
  for(const [name,offset,decision] of [['Vencida',-2,'draft'],['Próxima',2,'draft'],['En revisión',-1,'review'],['Cerrada',-3,'approved']] as const){
   const d=newInspection({name:'Inspectora de prueba',email:'author@example.invalid',accountId:'demo-inspector'}),o=newObservation(day(offset));
   const correction={actorId:'demo-admin',responsibleName:'Responsable',action:'Acción registrada',date,photos:[],state:decision==='approved'?'Ejecutado':'Pendiente',proposedState:'Pendiente',decision,note:''};
   await persistInspection({...d,area:name,date,observations:[o],delivery:{sentAt:new Date().toISOString(),recipientIds:['demo-admin'],revision:1,corrections:{[o.id]:correction as any}}});ids.push(d.id);
  }return ids;
 });
}
async function inbox(page:import('@playwright/test').Page){await page.reload();await page.getByRole('button',{name:'Buzón de Inspecciones',exact:true}).click();}
test('prioridades combinan vencimiento y revisión sin contar observaciones aprobadas',async({page})=>{
 await seed(page);await inbox(page);const rows=page.locator('.inspection-list-row');await expect(rows).toHaveCount(3);
 for(const [label,count] of [['Vencidas',2],['Por vencer',1],['En espera de respuesta',2],['Por validar / aprobar',1],['Cerradas',1]] as const){await page.getByRole('button',{name:label,exact:true}).click();await expect(rows).toHaveCount(count);}
 await page.getByRole('button',{name:'Vencidas',exact:true}).click();await expect(rows.filter({hasText:'Cerrada'})).toHaveCount(0);
 for(const width of [1366,390]){await page.setViewportSize({width,height:900});if(width<900)await page.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`/tmp/berry-priorities-${width}.png`,fullPage:true});}
});
test('cumplimiento distingue aprobación, vencimiento y tiempos de cierre verificables',async({page})=>{
 await seed(page);
 const result=await page.evaluate(async()=>{const {loadInspections}=await import('/src/model.ts');const {complianceMetrics,limaToday}=await import('/src/inspection-priority.ts');const list=await loadInspections();return complianceMetrics(list.map(data=>({data,sent_at:'2026-11-10T12:00:00Z',closed_at:data.area==='Cerrada'?'2026-11-12T12:00:00Z':null})),limaToday());});
 expect(result).toMatchObject({findings:4,approved:1,overdue:2,compliance:25,closed:1,averageDays:2,timedClosures:1});
});
test('la conversación conserva las respuestas de ambas personas al recargar y mantiene separados los estados',async({page})=>{
 const ids=await seed(page);await inbox(page);await page.locator('.inspection-list-row').filter({hasText:'Vencida'}).getByRole('button',{name:'Revisar inspección'}).click();
 const conversation=page.getByRole('region',{name:'Conversación y seguimiento'});await conversation.getByLabel('Escribir comentario').fill('¿Puedes confirmar la evidencia?');await conversation.getByRole('button',{name:'Enviar comentario',exact:true}).click();await expect(conversation.getByText('¿Puedes confirmar la evidencia?',{exact:true})).toBeVisible();
 await page.evaluate(async(id)=>{const {loadInspections}=await import('/src/model.ts');const {addLocalComment}=await import('/src/follow-up.ts');const d=(await loadInspections()).find(d=>d.id===id)!;await addLocalComment(d,d.observations[0].id,'demo-inspector','Sí, revisé la evidencia.',crypto.randomUUID());},ids[0]);
 await inbox(page);await page.locator('.inspection-list-row').filter({hasText:'Vencida'}).getByRole('button',{name:'Revisar inspección'}).click();await expect(conversation.getByText('¿Puedes confirmar la evidencia?',{exact:true})).toBeVisible();await expect(conversation.getByText('Sí, revisé la evidencia.',{exact:true})).toBeVisible();
});
test('cola sin conexión conserva evidencias y datos separados por usuario',async({page,context})=>{
 await seed(page);await context.setOffline(true);
 const result=await page.evaluate(async()=>{
  const {loadInspections}=await import('/src/model.ts');const {enqueueOffline,offlineJobs,getOfflineCache,putOfflineCache}=await import('/src/offline-store.ts');const inspection=(await loadInspections())[0];
  await enqueueOffline({actor:'actor-one',kind:'correction',inspection,observationId:inspection.observations[0].id,action:'save',value:{action:'Acción sin conexión',photos:[{id:crypto.randomUUID(),name:'foto.png',data:'data:image/png;base64,aGVsbG8='}]}});
  await putOfflineCache('actor-one','private',{value:'Solo del primer usuario'});
  return{mine:await offlineJobs('actor-one'),other:await offlineJobs('actor-two'),otherCache:await getOfflineCache('actor-two','private')};
 });
 expect(result.mine).toHaveLength(1);expect(result.mine[0].value?.photos?.[0].data).toContain('base64');expect(result.other).toHaveLength(0);expect(result.otherCache).toBeNull();await context.setOffline(false);
});

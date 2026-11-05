import { test, expect } from '@playwright/test';

test('prototipo permite probar Make sin claves ni activación y mantiene acuse separado de Outlook',async({page})=>{
 const calls:{headers:Record<string,string>;body:unknown}[]=[];
 await page.route('**/api/integrations/make/test',async route=>{
  const headers=route.request().headers();calls.push({headers,body:route.request().postDataJSON()});
  await route.fulfill({json:{ok:true,receipt:'http_accepted',request_id:headers['idempotency-key'],upstream_status:200,email_requested:false}});
 });
 await page.goto('./');await page.getByRole('button',{name:'Administración',exact:true}).click();await page.getByRole('button',{name:'Integraciones',exact:true}).click();
 await expect(page.getByRole('textbox')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Probar conexión con Make',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Probar conexión con Make',exact:true}).click();
 await expect(page.getByText('Make aceptó la solicitud (HTTP 200).',{exact:true})).toBeVisible();
 expect(calls).toHaveLength(1);expect(calls[0].body).toEqual({action:'make.test'});expect(calls[0].headers.authorization).toBeUndefined();
 await page.reload();await page.getByRole('button',{name:'Administración',exact:true}).click();await page.getByRole('button',{name:'Integraciones',exact:true}).click();
 await expect(page.getByRole('button',{name:'Probar conexión con Make',exact:true})).toBeEnabled();
 await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('rechazo y reintento: conserva el ID y no muestra éxito ficticio',async({page})=>{
 const ids:string[]=[];
 await page.route('**/api/integrations/make/test',async route=>{ids.push(route.request().headers()['idempotency-key']);await route.fulfill(ids.length<3?{status:504,json:{ok:false,receipt:'unconfirmed',code:'MAKE_TIMEOUT'}}:{status:502,json:{ok:false,receipt:'rejected',code:'MAKE_REJECTED',upstream_status:410}});});
 await page.goto('./');await page.getByRole('button',{name:'Administración',exact:true}).click();await page.getByRole('button',{name:'Integraciones',exact:true}).click();
 await page.getByRole('button',{name:'Probar conexión con Make',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Recepción no confirmada');
 await page.getByRole('button',{name:'Probar conexión con Make',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Recepción no confirmada');
 expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
 await page.getByRole('button',{name:'Preparar otra prueba',exact:true}).click();await page.getByRole('button',{name:'Probar conexión con Make',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Make rechazó la solicitud (HTTP 410).');expect(ids[2]).not.toBe(ids[1]);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

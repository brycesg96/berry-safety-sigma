import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect,test } from './test-fixture';
export async function expectAccessible(page:Page){
 await page.emulateMedia({reducedMotion:'reduce'});
 const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 await test.info().attach('auditoria-accesibilidad',{body:JSON.stringify(report.violations,null,2),contentType:'application/json'});
 expect(report.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,why:n.failureSummary}))}))).toEqual([]);
}

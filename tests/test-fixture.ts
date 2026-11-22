import { test as base, expect } from '@playwright/test';
import type { Browser, BrowserContext } from '@playwright/test';

// Install this route before each test's mocks. Later mock routes take precedence;
// an unmatched API or external request must never reach production services.
export const test = base.extend<{}, { browser: Browser }>({
  browser: [async ({ browser }, use, workerInfo) => {
    const origin = new URL(String(workerInfo.project.use.baseURL || 'http://127.0.0.1:5173/')).origin;
    const isolate = async (context: BrowserContext) => {
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
        return route.abort('blockedbyclient');
      });
    };
    const isolated = new Proxy(browser, {
      get(target, key) {
        if (key === 'newContext') return async (...args: Parameters<Browser['newContext']>) => {
          const context = await target.newContext(...args); await isolate(context); return context;
        };
        if (key === 'newPage') return async (...args: Parameters<Browser['newPage']>) => {
          const page = await target.newPage(...args); await isolate(page.context()); return page;
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await use(isolated);
  }, { scope: 'worker' }],
});

export { expect };
export type * from '@playwright/test';

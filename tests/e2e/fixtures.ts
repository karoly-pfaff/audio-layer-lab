import { test as base, expect, type Page } from '@playwright/test';
import { installWebAudioShimWhenMissing } from './web-audio-shim';

interface AppFixtures {
  appPage: Page;
}

export const test = base.extend<AppFixtures>({
  appPage: async ({ page }, use) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await installWebAudioShimWhenMissing(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    try {
      await page.getByRole('heading', { name: 'Audio Layer Lab', exact: true }).waitFor();
    } catch (error) {
      throw new Error(
        `Application failed to start. Browser errors: ${pageErrors.join(' | ') || 'none captured'}`,
        { cause: error },
      );
    }

    await use(page);
    expect(pageErrors, 'The application must not emit uncaught browser errors').toEqual([]);
  },
});

export { expect } from '@playwright/test';

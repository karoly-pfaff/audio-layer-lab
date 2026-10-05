import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { chooseFile, makeWavFile, setRangeValue } from './support';

async function storedAssetCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('audio-layer-lab-media', 1);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('assets', 'readonly');
          const count = transaction.objectStore('assets').count();
          count.onsuccess = () => {
            database.close();
            resolve(count.result);
          };
          count.onerror = () => reject(count.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

function acceptNextConfirmation(page: Page): void {
  page.once('dialog', (dialog) => dialog.accept());
}

test.describe('session, snapshots, and presets', () => {
  test('restores a playable session and snapshot workflow across reloads', async ({
    appPage: page,
  }) => {
    await chooseFile(
      page,
      page.getByRole('button', { name: 'Load main track' }),
      makeWavFile('remember-me.wav'),
    );
    await expect(page.getByRole('button', { name: 'Replace main track' })).toBeVisible();
    await setRangeValue(page.getByRole('slider', { name: 'Master volume (MASTER)' }), 0.35);
    await page.getByRole('button', { name: 'Save current mix as a snapshot' }).click();
    await expect(page.locator('.status-toast [role="status"]')).toHaveText('Snapshot saved');

    await page.getByRole('button', { name: 'Rename snapshot Snapshot 1' }).click();
    const rename = page.getByRole('textbox', { name: 'Rename snapshot Snapshot 1' });
    await rename.fill('Release mix');
    await rename.press('Enter');
    await expect(
      page.getByRole('group', { name: 'Snapshot: Release mix', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Duplicate snapshot Release mix' }).click();
    await expect(page.getByRole('group', { name: 'Snapshot: Release mix (copy)' })).toBeVisible();
    await page.getByRole('button', { name: 'Assign current mix to comparison slot A' }).click();
    await expect(page.getByRole('button', { name: 'Apply comparison mix A' })).toBeEnabled();

    const storedAssetId = await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem('audio-layer-lab-session') ?? '{}') as {
        main?: { assetId?: string };
      };
      return session.main?.assetId;
    });
    const statusMessage = await page.locator('.status-toast [role="status"]').textContent();
    expect(storedAssetId, statusMessage ?? 'No storage status available').toMatch(/^sha256-/);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Replace main track' })).toBeVisible();
    await expect(page.getByText('remember-me.wav')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect(page.getByRole('slider', { name: 'Master volume (MASTER)' })).toHaveValue('0.35');
    await expect(
      page.getByRole('group', { name: 'Snapshot: Release mix', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply comparison mix A' })).toBeEnabled();

    acceptNextConfirmation(page);
    await page.getByRole('button', { name: 'Reset session' }).click();
    await expect.poll(() => storedAssetCount(page)).toBe(0);
  });

  test('exports a valid preset and rejects invalid imports', async ({ appPage: page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export preset' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^audio-layer-lab-session-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const exported = JSON.parse(await readFile(downloadPath!, 'utf8')) as Record<string, unknown>;
    expect(exported['schema']).toBe('audio-layer-lab-session');
    expect(exported['version']).toBe(4);

    acceptNextConfirmation(page);
    await page.locator('input.preset-file-input').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"schema":"wrong"}'),
    });
    await expect(page.locator('.status-toast [role="status"]')).toHaveText('Invalid preset file');
  });

  test('imports a preset, exposes remembered audio, and resets cleanly', async ({
    appPage: page,
  }) => {
    const preset = {
      schema: 'audio-layer-lab-session',
      version: 3,
      exportedAt: '2026-10-04T12:00:00.000Z',
      main: {
        loop: true,
        volume: 0.5,
        pan: -0.25,
        filename: 'preset-main.wav',
        thumbnailUrl: null,
        bpm: 120,
        bpmConfidence: 'high',
      },
      layers: [
        {
          id: 'preset-layer',
          order: 0,
          volume: 0.4,
          pan: 0.2,
          muted: true,
          soloed: false,
          filename: 'preset-layer.wav',
          thumbnailUrl: null,
          bpm: 120,
          bpmConfidence: 'medium',
        },
      ],
      transport: { masterVolume: 0.3, masterMuted: false },
      snapshots: [],
      ab: { a: null, b: null },
    };

    acceptNextConfirmation(page);
    await page.locator('input.preset-file-input').setInputFiles({
      name: 'release-preset.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(preset)),
    });
    await expect(page.locator('.status-toast [role="status"]')).toHaveText(
      'Preset imported — reload audio files to play',
    );
    await expect(page.getByRole('button', { name: 'Reload main track' })).toBeVisible();
    await expect(page.getByText('preset-main.wav')).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByText('preset-layer.wav')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Master volume (MASTER)' })).toHaveValue('0.3');

    acceptNextConfirmation(page);
    await page.getByRole('button', { name: 'Reset session' }).click();
    await expect(page.locator('.status-toast [role="status"]')).toHaveText('Session reset');
    await expect(page.getByRole('listitem')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Load main track' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('listitem')).toHaveCount(5);
    await expect(page.getByText('preset-main.wav')).toBeHidden();
  });
});

import { test, expect } from './fixtures';
import { chooseFile, makeWavFile, setRangeValue } from './support';

test.describe('audio workflow', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit' && process.platform === 'win32',
    'Playwright WebKit on Windows omits native Web Audio decoding; Chromium covers it.',
  );

  test('loads main and layer audio, mixes them, and controls playback', async ({
    appPage: page,
  }) => {
    await chooseFile(
      page,
      page.getByRole('button', { name: 'Load main track' }),
      makeWavFile('main-tone.wav', 220),
    );
    await expect(page.getByText('main-tone.wav')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replace main track' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();

    await chooseFile(
      page,
      page.getByRole('button', { name: 'Load layer: Layer 1' }),
      makeWavFile('layer-tone.wav', 330),
    );
    const layer = page.getByRole('listitem', { name: /Layer 1: layer-tone\.wav/ });
    await expect(layer).toBeVisible();
    await layer.getByRole('button', { name: /Mute Layer 1/ }).click();
    await expect(layer.getByRole('button', { name: /Unmute Layer 1/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await layer.getByRole('button', { name: /Solo Layer 1/ }).click();

    await setRangeValue(page.getByRole('slider', { name: /Main track volume/ }), 0.45);
    await expect(page.getByRole('slider', { name: /Main track volume/ })).toHaveValue('0.45');
    await page.getByRole('button', { name: 'Enable main track loop' }).click();
    await expect(page.getByRole('button', { name: 'Disable main track loop' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause playback' })).toBeVisible();
    await page.getByRole('main').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Restart from beginning' }).click();
    await expect(page.getByLabel('Playback position 0:00.0')).toBeVisible();
    await page.getByRole('button', { name: 'Jump forward 5 seconds' }).click();
    await expect(page.getByLabel('Playback position 0:05.0')).toBeVisible();
    await page.getByRole('button', { name: 'Restart from beginning' }).click();
    await expect(page.getByLabel('Playback position 0:00.0')).toBeVisible();

    await page.getByRole('button', { name: 'Clear main track' }).click();
    await expect(page.getByRole('button', { name: 'Load main track' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  });

  test('reports a decode failure and preserves a previously loaded track', async ({
    appPage: page,
  }) => {
    await chooseFile(
      page,
      page.getByRole('button', { name: 'Load main track' }),
      makeWavFile('working.wav'),
    );
    await expect(page.getByText('working.wav')).toBeVisible();

    await chooseFile(page, page.getByRole('button', { name: 'Replace main track' }), {
      name: 'broken.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('not audio'),
    });
    await expect(page.locator('.status-toast [role="status"]')).toHaveText(
      'Failed to decode audio',
    );
    await expect(page.getByText('working.wav')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(page.locator('.status-toast [role="status"]')).toBeHidden();
  });
});

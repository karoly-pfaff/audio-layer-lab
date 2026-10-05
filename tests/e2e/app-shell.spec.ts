import { test, expect } from './fixtures';
import { installWebAudioShimWhenMissing } from './web-audio-shim';
import { chooseFile, makeWavFile, setRangeValue } from './support';

test.describe('application shell', () => {
  test('starts with a clean, usable mixer', async ({ appPage: page }) => {
    await expect(page).toHaveTitle('Audio Layer Lab');
    await expect(page.getByText('v1.0.1')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Main track controls' })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Mute master output' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply comparison mix A' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Skip to mixer' })).toHaveAttribute(
      'href',
      '#main-content',
    );
  });

  test('allows only one editing tab until the user explicitly takes over', async ({
    appPage: first,
    context,
  }) => {
    const second = await context.newPage();
    await installWebAudioShimWhenMissing(second);
    await second.goto('/');

    await expect(second.getByRole('heading', { name: /open in another tab/i })).toBeVisible();
    await chooseFile(
      first,
      first.getByRole('button', { name: 'Load main track' }),
      makeWavFile('handoff.wav'),
    );
    await expect(first.getByText('handoff.wav')).toBeVisible();
    await setRangeValue(first.getByRole('slider', { name: 'Master volume (MASTER)' }), 0.42);
    await first.getByRole('button', { name: 'Save current mix as a snapshot' }).click();
    await expect(first.getByRole('group', { name: 'Snapshot: Snapshot 1' })).toBeVisible();

    await second.getByRole('button', { name: 'Take over editing' }).click();
    await expect(second.getByRole('list')).toBeVisible();
    await expect(second.getByText('handoff.wav')).toBeVisible();
    await expect(second.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect(second.getByRole('slider', { name: 'Master volume (MASTER)' })).toHaveValue(
      '0.42',
    );
    await expect(second.getByRole('group', { name: 'Snapshot: Snapshot 1' })).toBeVisible();
    await expect(first.getByRole('heading', { name: /open in another tab/i })).toBeVisible();

    await second.reload();
    await expect(second.getByText('handoff.wav')).toBeVisible();
    await expect(second.getByRole('group', { name: 'Snapshot: Snapshot 1' })).toBeVisible();
  });

  test('keeps keyboard focus inside help and restores it on close', async ({ appPage: page }) => {
    const trigger = page.getByRole('button', { name: 'Keyboard shortcuts', exact: true });
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    const close = page.getByRole('button', { name: 'Close keyboard shortcuts' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('adds and removes dynamic layers and enforces the maximum', async ({ appPage: page }) => {
    const addLayer = page.getByRole('button', { name: '+ Layer' });
    await addLayer.click();
    await expect(page.getByRole('listitem')).toHaveCount(6);
    await page.getByRole('button', { name: 'Remove Layer 1' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(5);

    for (let index = 0; index < 7; index += 1) {
      await addLayer.click();
    }
    await expect(page.getByRole('listitem')).toHaveCount(12);
    await expect(addLayer).toBeDisabled();
  });

  test('does not overflow horizontally at a 320px viewport', async ({ appPage: page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await expect(
      page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });
});

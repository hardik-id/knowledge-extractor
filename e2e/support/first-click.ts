import { type Locator, type Page, expect } from "@playwright/test";

/**
 * The first click after a navigation, for something that opens a dialog or a menu.
 *
 * In `next dev` the page can be shown, and even answer a first click, before it has
 * settled: the list is built again after hydration, and what the click opened is
 * thrown away with it (found in a trace: the dialog was visible, and gone 70 ms later).
 * Playwright's click waits for the button, not for the page to be ready, so a plain
 * click can be lost. This clicks until the dialog is open, has the focus inside it
 * (Radix puts it there, and a rebuilt page loses it) and still stands after the
 * browser painted twice. If the click was lost, it is made again. No sleeps: every
 * wait is for something to be seen.
 */
export async function clickUntilOpen(page: Page, opener: Locator, opened: Locator) {
  await expect(async () => {
    if (!(await opened.isVisible())) await opener.click({ timeout: 2_000 });
    await openAndStill(page, opened);
  }).toPass({ timeout: 20_000 });
  return opened;
}

/** The same for the keyboard: `opener` gets the focus and `key` is pressed until `opened` stands. */
export async function pressUntilOpen(page: Page, opener: Locator, key: string, opened: Locator) {
  await expect(async () => {
    if (!(await opened.isVisible())) {
      await opener.focus({ timeout: 2_000 });
      await page.keyboard.press(key);
    }
    await openAndStill(page, opened);
  }).toPass({ timeout: 20_000 });
  return opened;
}

async function openAndStill(page: Page, opened: Locator) {
  await expect(opened).toBeVisible({ timeout: 1_000 });
  await expect(opened.locator(":focus")).toHaveCount(1, { timeout: 1_000 });
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  await expect(opened).toBeVisible({ timeout: 1_000 });
}

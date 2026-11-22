import { expectAccessible } from "./support/accessibility";
import { expect, test } from "./fixtures";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";
import { Switcher } from "./pages/switcher";

const FIRST = "platform-adrs.md";
const SECOND = "incident-runbook.md";

test("the switcher steps through the documents and shows their state before and after a run", async ({
  api,
  page,
  person,
  request,
}) => {
  const project = await projectWithDocuments(api, person, request, [FIRST, SECOND]);
  const extraction = new ExtractionPage(page);
  const switcher = new Switcher(page);
  await extraction.open(project);

  await expect(switcher.trigger).toContainText("1 of 2");
  await expect(switcher.previous).toBeDisabled();
  await expect(switcher.next).toBeEnabled();

  await switcher.open();
  await expect(switcher.item(FIRST)).toHaveAttribute("aria-current", "true");
  await expect(switcher.item(FIRST)).toContainText("Not run yet");
  await expect(switcher.item(SECOND)).toContainText("Not run yet");
  await expect(
    switcher.menu.getByRole("menuitem", { name: "Add or remove documents" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(switcher.menu).toHaveCount(0);

  await switcher.next.click();
  await expect(switcher.trigger).toContainText("2 of 2");
  await expect(switcher.trigger).toContainText(SECOND);
  await expect(switcher.next).toBeDisabled();
  await switcher.previous.click();
  await expect(switcher.trigger).toContainText(FIRST);

  await extraction.run("Run extraction");
  await extraction.finished();

  await switcher.open();
  await expect(switcher.item(FIRST)).toContainText("3 to review");
  await expect(switcher.item(SECOND)).toContainText(/to review|Nothing found|reviewed/);
  await page.keyboard.press("Escape");
  await expect(switcher.menu).toHaveCount(0);

  await switcher.switchDocument(SECOND);
  await expect(switcher.trigger).toContainText("2 of 2");
});

test("the switcher works with the keyboard", async ({ api, page, person, request }) => {
  const project = await projectWithDocuments(api, person, request, [FIRST, SECOND]);
  const switcher = new Switcher(page);
  await new ExtractionPage(page).open(project);

  await expect(switcher.trigger).toBeVisible();
  await switcher.trigger.focus();
  await page.keyboard.press("Enter");
  await expect(switcher.item(FIRST)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(switcher.item(SECOND)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(switcher.menu).toHaveCount(0);
  await expect(switcher.trigger).toContainText(SECOND);
  await expect(switcher.trigger).toBeFocused();

  await switcher.previous.focus();
  await page.keyboard.press("Enter");
  await expect(switcher.trigger).toContainText(FIRST);
});

test("the switcher fits at phone width and passes an accessibility scan", async ({
  api,
  page,
  person,
  request,
}) => {
  const project = await projectWithDocuments(api, person, request, [FIRST, SECOND]);
  const switcher = new Switcher(page);
  await new ExtractionPage(page).open(project);
  for (const size of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await expect(switcher.trigger).toBeVisible();
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(sideways, `sideways scroll at ${size.width}px`).toBe(false);
  }
  await switcher.open();
  await expectAccessible(page, "document switcher open", []);
});

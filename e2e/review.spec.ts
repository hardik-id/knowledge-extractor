import { expect, test } from "./fixtures";
import { RecordStripPage } from "./pages/record-strip";
import { documentPane } from "./pages/workspace";

const DOCUMENT = "platform-adrs.md";
const FIRST = "Use feature flags for risky releases";

// The review itself (accepting, rejecting, correcting, marking text, keyboard) is covered by
// record-strip.spec.ts. What stays here is what the review leads to: the output.
test("the output follows the review: accepted values, a rejected one left out, Copy", async ({
  api,
  context,
  expectApiError,
  page,
  person,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { strip } = await RecordStripPage.openWithResults(
    page,
    api,
    person,
    request,
    [DOCUMENT],
    expectApiError,
  );

  // Accept the first record; reject one value of the second; accept all that is still suggested.
  await strip.recordButton("Accept").click();
  await strip.next.click();
  await expect(strip.position).toHaveText("Record 2 of 3");
  const approver = documentPane(page).getByRole("button", { name: "Approved by: L. Visser" });
  const menu = await strip.openMenu("Approved by", approver);
  await menu.getByRole("button", { name: "Reject Approved by value" }).click();
  await expect(menu).toHaveCount(0);
  const list = await strip.openList();
  // By keyboard: with the Rejected group showing, the list reaches the dev build's badge, which
  // would take a pointer click (the badge is not in a production build).
  await list.getByRole("button", { name: "Accept all suggested" }).focus();
  await page.keyboard.press("Enter");
  await expect(list.getByRole("button", { name: "Accept all suggested" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The output: Markdown with the accepted values, and Copy puts it on the clipboard.
  await page.getByRole("button", { name: "Output", exact: true }).click();
  await expect(page.getByText("Output as Markdown")).toBeVisible();
  const output = page.getByLabel("Markdown output");
  await expect(output).toContainText(`## ${FIRST}`);
  await expect(output).toContainText("**Status:** accepted");
  await expect(output).toContainText("P. Bakker");
  await expect(output).not.toContainText("L. Visser");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText("Copied to the clipboard")).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(await output.innerText());
});

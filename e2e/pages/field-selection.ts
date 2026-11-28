import { type Locator, type Page, expect } from "@playwright/test";
import type { ApiWorkspace, Person } from "../fixtures";
import { ExtractionPage, workspaceWithDocuments } from "./extraction";
import { documentPane, fieldColumn, openOneScreen } from "./working-screen";

/** The faded look of a highlight: its fill and underline in the label colour at a quarter strength. */
const FADED = /-soft\/25/;

/** The field column and the document of the working screen, for selecting a field. */
export class FieldSelectionPage {
  constructor(readonly page: Page) {}

  /** The column beside the document, or the overlay's sheet at narrow widths. */
  get column(): Locator {
    return this.page.getByRole("complementary", { name: "Assistant" });
  }

  get sheet(): Locator {
    return this.page.getByRole("dialog", { name: "Assistant" });
  }

  get document(): Locator {
    return documentPane(this.page);
  }

  /** A workspace with a document; the screen open before a first run. */
  async openEmpty(
    api: Parameters<typeof workspaceWithDocuments>[0],
    person: Person,
    request: Parameters<typeof workspaceWithDocuments>[2],
  ): Promise<ApiWorkspace> {
    const workspace = await workspaceWithDocuments(api, person, request, ["platform-adrs.md"]);
    await openOneScreen(this.page, workspace);
    await expect(fieldColumn(this.page)).toBeVisible();
    return workspace;
  }

  /** The same, after a run: the document has highlights. */
  async openWithResults(
    api: Parameters<typeof workspaceWithDocuments>[0],
    person: Person,
    request: Parameters<typeof workspaceWithDocuments>[2],
  ): Promise<ApiWorkspace> {
    const workspace = await workspaceWithDocuments(api, person, request, ["platform-adrs.md"]);
    const extraction = new ExtractionPage(this.page);
    await openOneScreen(this.page, workspace);
    await extraction.run("Run extraction");
    await extraction.finished();
    await expect(this.document.locator("mark").first()).toBeVisible();
    return workspace;
  }

  /** The row of a field, by its name (found through the field's own checkbox). */
  row(scope: Locator, name: string): Locator {
    return scope
      .getByRole("row")
      .filter({ has: this.page.getByRole("checkbox", { name: `Exact quote for ${name}` }) });
  }

  /** A click on the row, on its colour dot: outside every control. */
  async select(scope: Locator, name: string) {
    await this.row(scope, name).getByTestId("field-dot").click();
  }

  /** The highlights of one field in the document. */
  marksOf(name: string): Locator {
    return this.document.locator(`mark[title="${name}"]`);
  }

  /** The highlights of every other field. */
  marksNotOf(name: string): Locator {
    return this.document.locator(`mark:not([title="${name}"])`);
  }

  async expectSelected(scope: Locator, name: string) {
    await expect(this.row(scope, name)).toHaveAttribute("aria-selected", "true");
  }

  async expectNothingSelected(scope: Locator) {
    await expect(scope.locator('tr[aria-selected="true"]')).toHaveCount(0);
  }

  async expectFaded(name: string) {
    await expect(this.marksOf(name).first()).not.toHaveClass(FADED);
    await expect(this.marksNotOf(name).first()).toHaveClass(FADED);
  }

  async expectNothingFaded() {
    await expect(this.document.locator("mark").first()).not.toHaveClass(FADED);
    await expect(this.document.locator("mark").last()).not.toHaveClass(FADED);
  }

  /** The prompt line above the table: a button until clicked. */
  get promptButton(): Locator {
    return this.column.getByRole("button", { name: /^What to extract/ });
  }

  get promptBox(): Locator {
    return this.column.getByRole("textbox", { name: "What to extract" });
  }
}

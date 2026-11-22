import { type APIRequestContext, type Page, expect } from "@playwright/test";
import type { Api, Person } from "../fixtures";
import { clickUntilOpen } from "../support/first-click";
import { ExtractionPage, projectWithDocuments } from "./extraction";
import { documentPane, openOneScreen } from "./workspace";

/** The record strip under the document, and the menu of a value opened from its highlight. */
export class RecordStripPage {
  constructor(readonly page: Page) {}

  /** A project with the document, its extraction run, and the working screen showing highlights. */
  static async openWithResults(
    page: Page,
    api: Api,
    person: Person,
    request: APIRequestContext,
    documents: string[],
    expectApiError: (e: { status: number; method?: string; path?: RegExp }) => void,
  ) {
    // Before the first run the document has no extraction: the backend answers 404 for it.
    expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
    const project = await projectWithDocuments(api, person, request, documents);
    const extraction = new ExtractionPage(page);
    await openOneScreen(page, project);
    await extraction.run();
    await extraction.finished();
    await expect(documentPane(page).locator("mark").first()).toBeVisible();
    return { project, extraction, strip: new RecordStripPage(page) };
  }

  get strip() {
    return this.page.getByRole("region", { name: "Found in this record" });
  }

  get previous() {
    return this.strip.getByRole("button", { name: "Previous record" });
  }

  get next() {
    return this.strip.getByRole("button", { name: "Next record" });
  }

  /** The "Record 1 of 3" button that opens the list of records. */
  get position() {
    return this.strip.getByRole("button", { name: /^Record \d+ of \d+$/ });
  }

  /** The list of this document's records, opened from the position button. */
  async openList() {
    return clickUntilOpen(
      this.page,
      this.position,
      this.page.getByRole("dialog", { name: "Records of this document" }),
    );
  }

  /** The line of a worked-out value, found by the field's name. */
  line(fieldName: string) {
    return this.strip
      .locator("[data-record-value]")
      .filter({ has: this.page.getByText(fieldName, { exact: true }) });
  }

  /** The record's own Accept and Reject sit in the first line, not in a value's group. */
  recordButton(name: "Accept" | "Reject" | "Undo" | "Delete") {
    return this.strip.getByRole("button", { name, exact: true });
  }

  /** The menu of the value whose highlight was clicked. */
  menu(fieldName: string) {
    return this.page.getByRole("dialog", { name: `Value of ${fieldName}` });
  }

  /** Opens the menu of a value by pressing its highlight (the first of the field, or the one given). */
  async openMenu(fieldName: string, highlight = this.highlights(fieldName).first()) {
    return clickUntilOpen(this.page, highlight, this.menu(fieldName));
  }

  /** The highlights of a field in the document. */
  highlights(fieldName: string) {
    return documentPane(this.page).getByRole("button", { name: new RegExp(`^${fieldName}: `) });
  }
}

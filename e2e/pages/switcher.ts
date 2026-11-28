import { type Locator, type Page, expect } from "@playwright/test";

/** The document switcher in the workspace top bar. */
export class Switcher {
  constructor(readonly page: Page) {}

  get root() {
    return this.page.getByRole("group", { name: "Document" });
  }

  get trigger() {
    return this.root.getByRole("button", { name: /^Document: / });
  }

  get previous() {
    return this.root.getByRole("button", { name: "Previous document" });
  }

  get next() {
    return this.root.getByRole("button", { name: "Next document" });
  }

  get menu() {
    return this.page.getByRole("menu");
  }

  /** The row of a document in the open list. */
  item(name: string): Locator {
    return this.menu.getByRole("menuitem", { name: new RegExp(`^${escape(name)}`) });
  }

  async open() {
    // The first click after a navigation can be lost while the page settles: click again.
    await expect(async () => {
      if (!(await this.menu.isVisible())) await this.trigger.click({ timeout: 2_000 });
      await expect(this.menu).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
  }

  /** Opens the list and picks the document by its file name. */
  async switchDocument(name: string) {
    await this.open();
    await this.item(name).click();
    // The list closes with an animation: a second switch must not take the closing list for an open one.
    await expect(this.menu).toBeHidden();
    await expect(this.trigger).toContainText(name);
  }
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { type Page, expect } from "@playwright/test";
import { fieldColumn } from "./workspace";

/** The assistant docked at the bottom of the field column, and the proposal it puts in the table. */
export class AssistantDock {
  constructor(private readonly page: Page) {}

  /** The column beside the document, or the sheet it becomes on a narrow screen. */
  get column() {
    return fieldColumn(this.page).or(this.page.getByRole("dialog", { name: "Fields" }));
  }

  get dock() {
    return this.column.getByRole("region", { name: "Assistant" });
  }

  get conversation() {
    return this.dock.getByRole("log", { name: "Conversation" });
  }

  get input() {
    return this.dock.getByRole("textbox", { name: "Ask the assistant" });
  }

  /** "3 suggested changes · Keep all · Discard all". */
  get bar() {
    return this.column.getByRole("region", { name: "Suggested changes" });
  }

  /** The rows the proposal adds to the table. */
  get newFieldRows() {
    return this.column.getByRole("row").filter({ hasText: "New field" });
  }

  async ask(text: string) {
    await this.input.fill(text);
    await this.dock.getByRole("button", { name: "Send" }).click();
    await expect(this.conversation.getByText(text)).toBeVisible();
  }

  async clear() {
    await this.dock.getByRole("button", { name: "More about the conversation" }).click();
    await this.page.getByRole("menuitem", { name: "Clear conversation" }).click();
    await this.page
      .getByRole("dialog", { name: "Clear the conversation?" })
      .getByRole("button", { name: "Clear conversation" })
      .click();
  }
}

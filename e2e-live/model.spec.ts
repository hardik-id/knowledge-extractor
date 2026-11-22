import { expect, test } from "../e2e/fixtures";
import { AssistantDock } from "../e2e/pages/assistant-dock";
import { ExtractionPage, projectWithDocuments } from "../e2e/pages/extraction";
import { modelSkipReason } from "./env.mjs";

// A model takes its time: the reply, with its tool calls, can run a minute or more.
test.setTimeout(240_000);

test.describe("the assistant with the real model", () => {
  test.skip(modelSkipReason() !== null, modelSkipReason() ?? "");

  test("answers a request to extract from the architecture documents with a proposal", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, [
      "architecture-decisions-2026.md",
      "platform-adrs.md",
    ]);
    const extraction = new ExtractionPage(page);
    await extraction.open(project);

    const dock = new AssistantDock(page);
    await dock.ask("Extract every architecture decision record from these documents.");

    // Three ways the reply can end: a proposal, or the backend saying it has no model, or
    // the scripted agent's help text (the backend still runs ASSISTANT_AGENT=scripted).
    // A proposal is shown in the table of the column: the bar with Keep all and Discard all.
    const proposal = dock.bar;
    const notConfigured = dock.conversation.getByText("No language model is configured");
    const scripted = dock.conversation.getByText("I didn't understand that one");
    await expect(proposal.or(notConfigured).or(scripted)).toBeVisible({ timeout: 180_000 });
    test.skip(
      (await notConfigured.isVisible()) || (await scripted.isVisible()),
      "The backend answers without a model (ASSISTANT_AGENT=scripted, or openai without LLM_MODEL and OPENAI_API_KEY, or LLM_PROVIDER=azure without its endpoint; docs/assistant.md in the backend repository).",
    );

    // Not the exact words: a record type that reads as a decision record, with fields.
    await expect(dock.column.getByText("New record type").first()).toBeVisible();
    await expect(dock.column.getByRole("table").first()).toBeVisible();
  });
});

# Knowledge Studio redesign (approved 2026-11-22)

One working screen for a Studio project: the document on the left, one list of fields with their values on the right, the assistant as a line at the bottom of that list. Define and Review stop being separate tabs.

The screens are on a design canvas: https://claude.ai/artifact/9TwyPyoViaYsukUxiBJmac (private to the product owner). Their source is in this folder, to read for the exact structure, labels, sizes and colours. They are mock-ups, not app code, and do not run on their own:

| File | Screen |
| --- | --- |
| `Main.dc.html` | The working screen: document, fields and values together |
| `Start.dc.html` | A new project starts empty |
| `Switcher.dc.html` | Switching documents |
| `FieldEditor.dc.html` | Editing a field where it is |
| `Proposal.dc.html` | The assistant suggests changes you keep or discard |

## The design

1. **No left sidebar on project screens.** One top bar, about 48px: the logo, a "Projects" link, "/", the project name (a menu: rename, edit description, delete), a document switcher (the file name, "n of N", previous and next), a "Document | Output" switch, then on the right the version text, "Assistant", one orange Run button, a "more" menu, the theme toggle and the account menu.
2. **The document switcher** lists the project's documents with their state ("3 to review", "3 records reviewed" when none is left to review, "Not run yet", "Running…", "Run failed", "Nothing found") and ends with "Add or remove documents", which opens the document picker in a sheet. A project with no documents shows the picker as the whole screen ("Use N documents"). There is no separate Documents page.
3. **Left: the document**, rendered, with highlights. Only the selected record's quotes are filled in their field colours. Quotes of other records get a faint dashed underline. No label chips inside the text and no legend above it; hovering a highlight names its field. "Document | Output" swaps this pane to the output of this document; the output format and template settings live in the Output view. The switch is hidden while the configuration is empty.
4. **Right: one column**, about 520px (at least 440px; below about 1100px wide it becomes an overlay opened by a "Fields" button). From the top:
   - the record type: its name, "n fields", "Add field"; a segmented control when there are several record types;
   - "What to extract": the prompt on one line, truncated; a click edits it in place;
   - the record bar: previous and next record, "Record 1 of 3" (opens the list of this document's records, with "Accept all suggested"), the record's review state, Accept and Reject;
   - one list of field rows. A row has the field's colour dot and name, a one-line summary of its definition ("Text · word for word", "Choice · worked out", "Text · word for word · several") and the value or values of that field in the selected record. Before any run the rows show the definitions with empty values.
5. **A field's definition opens in place** under its row when its name is clicked: "Field definition: applies to every record, in every document", with the name, the type, what to look for, the allowed values of a choice, word for word or worked out, several values, and Remove field. Correcting a value and marking text by selecting it in the document keep today's rules.
6. **The assistant** is a one-line input at the bottom of the right column. Using it, or "Assistant" in the top bar, opens the conversation upward inside the column, oldest message first. A proposal is shown in the field list: a bar "3 suggested changes · Keep all · Discard all" and, for each change, a row or a line under the row it concerns (a new field, a changed setting, a removal), each later with its own Keep and Discard. A message that proposed changes keeps a one-line record ("1 kept", "Waiting for you"). "Clear conversation" is in a small menu.
7. **A new project starts empty.** The New project dialog asks for a name and a description only, and always creates the project from the blank template. With an empty configuration the right column shows "What do you want from these documents?" with a text box and the orange "Suggest fields" (it asks the assistant), "Or start from a template" with the three templates as rows, and "Or start fresh" with "Add a field yourself" (it adds a record type named "Record" with one field; the name can be changed). A template fills the list as suggestions to keep or discard.
8. **Run.** One orange button that says what happens: "Run on this document" (menu: "Run on all N documents") when this document has no results or the configuration changed since its run; "Run on all N documents" when this one is current and others are not; a secondary "Run again" when everything is current; disabled while the configuration is empty. Running saves the configuration first when it has unsaved changes. A document whose records come from an older version of the configuration shows a quiet "Fields changed since this run". When the backend refuses a run because another is going, the screen says so.
9. **Versions.** The version text reads "Version 3", "Version 3 · unsaved changes" or "Nothing saved yet". A click opens save with a note, discard changes and the version history.
10. **Gone:** the "Ready to proceed" badge, the helper paragraphs under the prompt and above the record types, the "Exact quote" and "Several values" checkbox columns, the file list column of Review and Output, the assistant's footer hint.
11. **Sizes.** It works at 1440x900 and 1280x720 with no sideways page scroll, and stacks or overlays at 390x844. The rules of `design/DESIGN.md` (Polder for apps) stay: hairlines, 4px and 6px radii, 14px Inter, 32px controls, one orange action per view, a visible focus ring, both themes.

## What does not change

The pipeline app keeps its three tabs (Define, Review, Output) and its shared components in `src/features/extraction`. The Studio gets its own screen in `src/apps/studio/`, composed from those parts. A change to a shared file is a new option whose default keeps today's behaviour.

The API does not change. Per-document state comes from each file's extraction until the backend puts it on the cell; "Suggest fields" sends the text without naming the open document; the outcome of a proposal ("1 kept") is kept on the page only.

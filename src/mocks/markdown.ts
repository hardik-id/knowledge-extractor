import type { SourceFile } from "@/types/pipeline";
import { FILE_TYPE_LABEL, SOURCE_LABEL, formatDate } from "@/lib/format";

/** Example Markdown output for a source file, until the real converter exists. */
export function mockMarkdownFor(file: SourceFile): string {
  const body =
    file.type === "xlsx"
      ? `## Sheet: Summary

| Region | Q2 (€k) | Q3 (€k) | Change |
| --- | ---: | ---: | ---: |
| North | 1,204 | 1,322 | +9.8% |
| South | 988 | 951 | −3.7% |
| West | 1,410 | 1,566 | +11.1% |

> Converted from 3 sheets. Formulas were replaced by their values.`
      : `## Summary

This document was converted from ${FILE_TYPE_LABEL[file.type]} to Markdown. Headings, lists and tables are kept; images are replaced by their alt text.

## Key points

1. Applies to all permanent and temporary staff.
2. Requests go through the self-service portal.
3. Managers approve within **5 working days**.

## Contacts

- Owner: *${file.location.split(" / ")[0]} team*
- Review cycle: yearly`;

  return `# ${file.name.replace(/\.[^.]+$/, "")}

_Source: ${SOURCE_LABEL[file.source]} · ${file.location} · last modified ${formatDate(file.modifiedAt)}_

${body}
`;
}

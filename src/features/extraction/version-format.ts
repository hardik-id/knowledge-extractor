const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-11-19T10:00:00Z" → "19 November" (with the year when it is not this year). */
export function formatSavedDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const text = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? text : `${text} ${d.getFullYear()}`;
}

/** "Version 4, saved 19 November" */
export function versionLine(version: number, createdAt: string, now?: Date): string {
  const date = formatSavedDate(createdAt, now);
  return date ? `Version ${version}, saved ${date}` : `Version ${version}`;
}

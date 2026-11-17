/** Up to two capital letters for a round badge: "Ada Lovelace" -> "AL". "?" when there is no name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  // An email address is not a name: its first letter will do.
  const first = Array.from(words[0])[0];
  if (words.length === 1 || words[0].includes("@")) return first.toUpperCase();
  const last = Array.from(words[words.length - 1])[0];
  return (first + last).toUpperCase();
}

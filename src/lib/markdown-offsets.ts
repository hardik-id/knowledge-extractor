/**
 * Maps the text of one rendered Markdown text node back to the Markdown source.
 *
 * A text node knows which stretch of the source it came from, but the two are
 * not always the same string: `&amp;` renders as `&`, `\*` as `*`, and inline
 * code loses its backticks. This lines the two up character by character.
 */

const ENTITY = /^&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

/**
 * For each index of `rendered`, the index in the whole source of the character
 * it came from, plus one last entry for the end. `source` is the stretch of
 * Markdown the node covers and `sourceStart` is where that stretch begins.
 *
 * The result always has `rendered.length + 1` entries and never goes down.
 */
export function alignToSource(rendered: string, source: string, sourceStart: number): number[] {
  const map = new Array<number>(rendered.length + 1);
  if (rendered === source) {
    for (let i = 0; i <= rendered.length; i++) map[i] = sourceStart + i;
    return map;
  }

  let j = 0;
  for (let i = 0; i < rendered.length; i++) {
    let at = j;
    // Skip what the source has and the rendered text doesn't: backslashes, backticks, the rest of an entity.
    while (
      at < source.length &&
      source[at] !== rendered[i] &&
      !decodesTo(source, at, rendered[i])
    ) {
      at++;
    }
    if (at >= source.length) {
      // No match from here on (should not happen): pin the rest to the end of what was matched.
      for (let k = i; k < rendered.length; k++) map[k] = sourceStart + Math.min(j, source.length);
      map[rendered.length] = sourceStart + source.length;
      return map;
    }
    map[i] = sourceStart + at;
    const entity = ENTITY.exec(source.slice(at, at + 12));
    const literal = entity !== null && rendered.startsWith(entity[0], i);
    j = entity && !literal ? at + entity[0].length : at + 1;
  }
  map[rendered.length] = sourceStart + Math.min(j, source.length);
  return map;
}

/** Whether an entity starts at `at` in the source. Any entity is taken to stand for the one rendered character. */
function decodesTo(source: string, at: number, char: string): boolean {
  return source[at] === "&" && char !== "&" && ENTITY.test(source.slice(at, at + 12));
}

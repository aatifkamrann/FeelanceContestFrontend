/**
 * The skill chips under the opportunity form’s required-skills list: names
 * that already exist on this portal and appear in the brief. A lookup
 * against real data, not a guess about it — which is why it is here and
 * not behind a model call, and why it survives with AI switched off.
 *
 * Which kind of work a brief is, is a different question, and a word list
 * was never much good at it: "shop" cannot tell a shop website from a shop
 * logo. A model answers that one now — see AiCategoryDraft.
 *
 * The profile's chips are a third thing again, and the simplest: a member
 * has said which kinds of work are theirs, and each kind carries the names
 * this portal spells those tools with. Nothing is being guessed, so nothing
 * is being called.
 */

/** The text in comparison form: lower-case, one space between words, no punctuation but the kind a skill name carries. */
function fold(text: string): string {
  return (
    ' ' +
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}#+./-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim() +
    ' '
  );
}

/** How many times a name occurs as a whole word or phrase — "react" must not match "reaction". */
function hits(folded: string, name: string): number {
  let n = 0;
  let from = 0;
  const needle = name.toLowerCase();
  for (;;) {
    const i = folded.indexOf(needle, from);
    if (i < 0) return n;
    const before = folded[i - 1];
    const after = folded[i + needle.length];
    const boundary = (c: string | undefined) => c === undefined || /[\s,;:()"'`]/.test(c);
    if (boundary(before) && boundary(after)) n++;
    from = i + needle.length;
  }
}

/**
 * The names worth offering somebody who works in these kinds of work, their
 * primary kind first, minus whatever is already on their list. The offer is
 * what to add — and one spelling of it, so the same skill is one name across
 * every profile on the portal.
 */
export function skillsForCategories(
  taxonomy: { key: string; skills: string[] }[],
  chosen: (string | null)[],
  already: string[],
  limit = 12,
): string[] {
  const have = new Set(already.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const offered: string[] = [];
  for (const key of chosen) {
    const category = key === null ? undefined : taxonomy.find((c) => c.key === key);
    for (const name of category?.skills ?? []) {
      if (offered.length === limit) return offered;
      const folded = name.toLowerCase();
      if (have.has(folded)) continue;
      have.add(folded);
      offered.push(name);
    }
  }
  return offered;
}

/**
 * Skills the brief names, from the given vocabulary — the starter skill list
 * plus whatever members already wrote — minus the ones already listed.
 * Offered as chips the client adds one at a time, never added for them.
 */
export function suggestSkills(
  title: string,
  brief: string,
  vocabulary: string[],
  already: string[],
  limit = 8,
): string[] {
  const text = fold(title + ' ' + brief);
  const have = new Set(already.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const found: { name: string; n: number }[] = [];
  const seen = new Set<string>();
  for (const name of vocabulary) {
    const key = name.trim().toLowerCase();
    if (key.length < 2 || have.has(key) || seen.has(key)) continue;
    seen.add(key);
    const n = hits(text, key);
    if (n > 0) found.push({ name: name.trim(), n });
  }
  return found
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((f) => f.name);
}

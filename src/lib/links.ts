/**
 * Deep links: addresses that open a screen already narrowed to what was
 * clicked. The dashboard's figures open the reports, Users and Operations
 * this way — "3 clients" opens Users showing clients, a client's wins open
 * their awarded opportunities.
 *
 * A screen reads its link once, on mount, as the starting value of its
 * filters; from then on the filters are the reader's, and the address is
 * left as it came so the link can be copied or reloaded. A value a screen
 * does not know is dropped rather than left filtering to nothing.
 */

type LinkValue = string | readonly string[] | null | undefined | false;

/**
 * `path?key=a,b&other=c#hash` — lists joined with commas, empty and false
 * values left out, each value encoded on its own so the commas stay readable.
 */
export function linkTo(path: string, params: Record<string, LinkValue> = {}, hash?: string): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === false) continue;
    const values = (typeof value === 'string' ? [value] : [...value]).filter((v) => v !== '');
    if (values.length > 0) parts.push(`${encodeURIComponent(key)}=${values.map(encodeURIComponent).join(',')}`);
  }
  return `${path}${parts.length ? `?${parts.join('&')}` : ''}${hash ? `#${hash}` : ''}`;
}

/** A figure's link, or none when it counts nothing — an empty list is not worth a tab. */
export function linkIf(n: number, href: string): string | null {
  return n > 0 ? href : null;
}

/** The address's query as the browser has it; empty where there is no window. */
export function linkParams(): URLSearchParams {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

/** A comma list from the address; with `known`, only the values the screen has a word for. */
export function listParam<T extends string = string>(
  params: URLSearchParams,
  key: string,
  known?: readonly T[],
): T[] {
  const values = (params.get(key) ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return (known ? values.filter((v) => (known as readonly string[]).includes(v)) : values) as T[];
}

/**
 * A day, or a from–to pair, from the address — "2026-09-12" or
 * "2026-09-01,2026-09-12" — as the date filters hold them: local midnights,
 * so the day is the reader's own. Null for anything else.
 */
export function dayParam(params: URLSearchParams, key: string): Date[] | null {
  const days = listParam(params, key)
    .slice(0, 2)
    .map((v) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (!m) return null;
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      // 2026-02-31 rolls into March; a day that does not exist is no day.
      return d.getMonth() === Number(m[2]) - 1 ? d : null;
    });
  if (days.length === 0 || days.some((d) => d === null)) return null;
  const [from, to = from] = days as Date[];
  return [new Date(from), new Date(to)];
}

/** An award's state as the award filters name it: announced and waiting for payment, or paid. */
export type AwardState = 'unpaid' | 'paid';

export const AWARD_STATE_ORDER: AwardState[] = ['unpaid', 'paid'];

export const AWARD_STATE_LABEL: Record<AwardState, string> = {
  unpaid: 'Announced, unpaid',
  paid: 'Paid',
};

/** Null where no award was announced. */
export function awardState(announcedAtUtc: string | null, paidAtUtc: string | null): AwardState | null {
  return announcedAtUtc === null ? null : paidAtUtc === null ? 'unpaid' : 'paid';
}

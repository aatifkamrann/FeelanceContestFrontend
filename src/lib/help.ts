
import { apiFetch } from '@/lib/api';
export type HelpTopic = {
  id: string;
  short: string;
  detail: string | null;
  why: string | null;
  example: string | null;
  learnMoreUrl: string | null;
};

/**
 * The whole help catalogue in one cached request. It is static per deployment
 * and small, so fetching it once beats a request per icon.
 */
export async function fetchHelp(): Promise<Map<string, HelpTopic>> {
  const res = await apiFetch('/api/help');
  if (!res.ok) throw new Error(`Help unavailable (${res.status})`);
  const body = (await res.json()) as { topics: HelpTopic[] };
  return new Map(body.topics.map((t) => [t.id, t]));
}

export const helpQuery = {
  queryKey: ['help'],
  queryFn: fetchHelp,
  staleTime: 5 * 60_000,
} as const;

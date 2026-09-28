import { RELEVANT_FROM, type ApplyContext, type Commitment } from '@/lib/applications';

/**
 * What the eight steps collect, in one object the wizard keeps in session
 * storage under the opportunity's slug — so a tab closed on step five reopens
 * on step five, and nothing is sent until the last step's button.
 */
export type Draft = {
  summary: string;
  approach: string;
  projectIds: string[];
  commitment: Commitment;
  hoursPerWeek: number;
  advantages: string[];
  githubUsername: string;
  dedicateTime: boolean;
  onSchedule: boolean;
  competitive: boolean;
  originalWork: boolean;
};

/**
 * The draft as the wizard opens it: the profile's own summary and hours,
 * the past work the portal reads as relevant already ticked, and the
 * advantages it can see already chosen — every one of them the applicant's
 * to change before anything is sent.
 */
export function initialDraft(ctx: ApplyContext): Draft {
  const hours = ctx.profile.hoursPerWeek ?? 30;
  return {
    summary: ctx.profile.summary ?? '',
    approach: '',
    projectIds: ctx.profile.projects.filter((p) => (p.relevance ?? 0) >= RELEVANT_FROM).map((p) => p.id),
    commitment: hours >= 30 ? 'full' : hours >= 15 ? 'partial' : 'limited',
    hoursPerWeek: Math.min(Math.max(hours, 1), 80),
    advantages: ctx.suggestedAdvantages,
    githubUsername: '',
    dedicateTime: false,
    onSchedule: false,
    competitive: false,
    originalWork: false,
  };
}

/** GitHub's own rule for a username, the same one the API applies. */
export const GITHUB_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

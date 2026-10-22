'use client';

import Link from 'next/link';
import { RankTable } from '@/components/dashboard/kit';
import type { AdminAiUsage, AdminAiUsageLine, AdminAiUsageTotals } from '@/lib/admin';
import OperationsFrame, { many, useOperations } from '../OperationsFrame';

/**
 * Operations › AI usage: what the AI features have cost — today against the
 * daily limits, then thirty days of calls and tokens by feature and by
 * model, priced as the settings price them now. Tables only: a row here is
 * a sum, with nothing to open and nothing to act on.
 */
export default function AiUsageScreen() {
  const ops = useOperations();
  const usage = ops.data?.aiUsage;
  const features = (usage?.byFeature ?? []).filter((l) => ops.matches(l.name, featureWords(l.name)));
  const models = (usage?.byModel ?? []).filter((l) => ops.matches(l.name));

  return (
    <OperationsFrame
      ops={ops}
      path="/admin/operations/ai-usage"
      title="AI usage"
      help="admin.aiUsage"
      intro="What the AI features have cost: today against the daily limits, and the last thirty days by feature and by model."
      cards={false}
      search="Search features and models"
      shown={features.length + models.length}
      total={(usage?.byFeature.length ?? 0) + (usage?.byModel.length ?? 0)}
      noun={['line', 'lines']}
    >
      {({ aiUsage }) => (
        <AiUsagePanel usage={aiUsage} features={features} models={models} noneMatch={ops.searching ? ops.noneMatch : null} />
      )}
    </OperationsFrame>
  );
}

/**
 * The two totals as tiles, then the window by feature and by model. A
 * dollar figure appears only where every model behind it has a price,
 * and the models without one are named, so no number here is quietly low.
 */
function AiUsagePanel({
  usage,
  features,
  models,
  noneMatch,
}: {
  usage: AdminAiUsage;
  features: AdminAiUsageLine[];
  models: AdminAiUsageLine[];
  noneMatch: string | null;
}) {
  const empty = noneMatch ?? 'No model has been called in the last thirty days.';
  const columns = (first: string) => [
    { key: 'name', label: first },
    { key: 'calls', label: 'Calls', align: 'right' as const },
    { key: 'in', label: 'Tokens in', align: 'right' as const },
    { key: 'out', label: 'Tokens out', align: 'right' as const },
    { key: 'cost', label: 'Est. cost', align: 'right' as const },
  ];
  const rows = (lines: AdminAiUsageLine[], word: (name: string) => string) =>
    lines.map((l) => ({
      name: (
        <span className="block min-w-0">
          <span className="font-mono text-xs">{l.name}</span>
          {word(l.name) && <span className="ml-2 text-xs text-[var(--text-color-secondary)]">{word(l.name)}</span>}
        </span>
      ),
      calls: <span className="tabular-nums">{l.calls.toLocaleString()}</span>,
      in: <span className="whitespace-nowrap tabular-nums">{l.inputTokens.toLocaleString()}</span>,
      out: <span className="whitespace-nowrap tabular-nums">{l.outputTokens.toLocaleString()}</span>,
      cost: <span className="whitespace-nowrap font-semibold tabular-nums">{dollars(l.costUsd)}</span>,
    }));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <UsageTile label="Today" totals={usage.today} note={budgetLine(usage)} />
        <UsageTile label={`Last 30 days, since ${usage.fromDay}`} totals={usage.window} note={priceLine(usage)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-color-secondary)]">By feature</h2>
          <RankTable empty={empty} columns={columns('Feature')} rows={rows(features, featureWords)} />
        </section>
        <section>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-color-secondary)]">By model</h2>
          <RankTable empty={empty} columns={columns('Provider / model')} rows={rows(models, () => '')} />
        </section>
      </div>
      {usage.unpriced.length > 0 && (
        <p className="text-xs text-[var(--text-color-secondary)]">
          No price is saved for {usage.unpriced.join(', ')}, so the estimates leave {usage.unpriced.length === 1 ? 'it' : 'them'} out.
          Prices are under{' '}
          <Link href="/admin/settings" className="text-[var(--primary-color)] underline-offset-2">
            Settings
          </Link>{' '}
          → AI automation.
        </p>
      )}
    </div>
  );
}

function UsageTile({ label, totals, note }: { label: string; totals: AdminAiUsageTotals; note: string }) {
  return (
    <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-ground)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--text-color-secondary)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--primary-color)]">
        {dollars(totals.costUsd)}
        <span className="ml-2 text-sm font-normal text-[var(--text-color-secondary)]">{many(totals.calls, 'call', 'calls')}</span>
      </p>
      <p className="mt-1 text-xs tabular-nums text-[var(--text-color-secondary)]">
        {totals.inputTokens.toLocaleString()} tokens in · {totals.outputTokens.toLocaleString()} out
      </p>
      <p className="mt-2 text-xs text-[var(--text-color-secondary)]">{note}</p>
    </div>
  );
}

/** "$0.0123" below a dollar, cents above it; a dash where nothing can be priced. */
function dollars(usd: number | null): string {
  if (usd === null) return '—';
  return usd < 1 ? `$${usd.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}` : `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function budgetLine(u: AdminAiUsage): string {
  const limit = `${u.today.calls.toLocaleString()} of ${u.dailyCallLimit.toLocaleString()} calls`;
  if (u.dailyBudgetUsd === null) return `${limit} · no daily budget`;
  if (!u.pricesSet) return `${limit} · the ${dollars(u.dailyBudgetUsd)} budget has no prices to measure against`;
  return `${limit} · budget ${dollars(u.dailyBudgetUsd)}`;
}

function priceLine(u: AdminAiUsage): string {
  if (!u.pricesSet) return 'No model prices are saved, so nothing is estimated in dollars.';
  return u.unpriced.length > 0 ? 'Estimates leave unpriced models out.' : 'Estimated at the saved prices.';
}

/** A feature's switch name in words — the label its setting carries, near enough to find. */
const FEATURE_WORDS: Record<string, string> = {
  entryDigest: 'entry review digests',
  milestoneExtraction: 'milestones from a brief',
  briefCoach: 'brief coach',
  spamFilter: 'spam filter',
  progressNarrative: 'daily narratives',
  seoMetadata: 'SEO metadata',
  standingNotes: 'standing notes',
  categorySuggestion: 'category suggestions',
  recommendedMatching: 'recommended matching',
  profileSummary: 'profile summaries',
  profileReview: 'profile reviews',
  projectApproach: 'approach drafts',
  applicationEvaluation: 'application evaluations',
  requirementsSuggestion: 'requirements drafts',
  criteriaSuggestion: 'rubric drafts',
  awardSuggestion: 'award suggestions',
  settingsTest: 'the settings test button',
};
const featureWords = (name: string) => FEATURE_WORDS[name] ?? '';

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { OpportunityCardView } from '@/app/opportunities/OpportunityFeed';
import HelpIcon from '@/components/HelpIcon';
import { usePortalName } from '@/components/PortalNote';
import SiteHeader from '@/components/SiteHeader';
import { meQuery } from '@/lib/opportunities';
import { welcomeQuery, type Welcome } from '@/lib/profile';

/**
 * The screen after the eighth step of joining: what joining bought. The
 * API reads every number fresh off the saved profile and the opportunities open
 * today, so this is not a one-off — a member who comes back a week later
 * is shown that week's standing under the same greeting.
 */
export default function WelcomePage() {
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const { data, isLoading, isError, refetch } = useQuery({ ...welcomeQuery, enabled: !!me });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {meLoading || (me && isLoading) ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
        ) : !me ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">Sign in to see where you stand</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              This page reads your own profile against the opportunities open today.
            </p>
            <Link href="/login?next=%2Fwelcome" className="no-underline">
              <Button label="Sign in" icon="pi pi-sign-in" className="mt-4" />
            </Link>
          </div>
        ) : isError || !data ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
            <p className="mt-3 font-medium">This page could not be loaded</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Nothing on your profile changed — this screen only reads it.
            </p>
            <Button label="Try again" className="mt-4" outlined onClick={() => void refetch()} />
          </div>
        ) : (
          <WelcomeView data={data} />
        )}
      </main>
    </>
  );
}

function WelcomeView({ data }: { data: Welcome }) {
  const portal = usePortalName();
  const freelancer = data.role === 'freelancer';
  const rank = data.rank;

  return (
    <div className="flex flex-col items-center text-center">
      <i
        className="pi pi-check-circle text-6xl text-green-700 dark:text-green-400"
        role="img"
        aria-label="Your profile is ready"
      />
      <h1 className="mt-4 text-3xl font-bold">Welcome to the Network</h1>
      <p className="mt-3 text-lg">Welcome, {data.displayName}.</p>
      <p className="mt-1 max-w-xl text-[var(--text-color-secondary)]">
        Your profile is ready.{' '}
        {!freelancer ? (
          'Your first brief is the next thing to write.'
        ) : data.matches > 0 ? (
          <>
            {portal} has identified{' '}
            <strong className="text-[var(--text-color)]">
              {data.matches} {data.matches === 1 ? 'opportunity' : 'opportunities'}
            </strong>{' '}
            that {data.matches === 1 ? 'matches' : 'match'} your current expertise.
          </>
        ) : (
          <>{portal} has not found an open opportunity that matches your current expertise yet.</>
        )}
        {freelancer && <HelpIcon topic="profile.welcome" label="What counts as an opportunity" />}
      </p>

      {freelancer && rank && (
        <dl className="mt-8 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          <Box value={`${data.strengthPercent ?? 0}%`} label="Profile Strength" />
          <Box
            value={String(data.meritScore ?? 0)}
            label="MeritScore"
            title={`Merit score ${data.meritScore ?? 0} of ${data.meritMax ?? 100}`}
          />
          <Box
            value={`#${rank.global}`}
            label="Global Rank"
            title={`Among ${rank.ofFreelancers} freelancer${rank.ofFreelancers === 1 ? '' : 's'} on the portal`}
            help={<HelpIcon topic="profile.rank" label="How a rank is worked out" />}
          />
          {rank.category ? (
            <Box
              value={`#${rank.category.rank}`}
              label={rank.category.label}
              title={`Among ${rank.category.of} freelancer${rank.category.of === 1 ? '' : 's'} whose primary category is ${rank.category.label}`}
            />
          ) : (
            <Box value="—" label="Primary category" title="Choose a kind of work on your profile for a rank among the freelancers doing it" />
          )}
        </dl>
      )}

      {freelancer && (
        <section className="mt-8 w-full text-left">
          <h2 className="text-lg font-semibold">Your strongest opportunity</h2>
          {data.strongest ? (
            <div className="mt-3">
              <OpportunityCardView
                opportunity={data.strongest}
                layout="row"
                note={
                  data.strongestWork && (
                    <p className="mt-3 rounded-lg bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text-color)]">
                      <span className="text-[var(--text-color-secondary)]">
                        <i className="pi pi-briefcase mr-1" aria-hidden />
                        From your past work:{' '}
                      </span>
                      <span className="font-medium">{data.strongestWork.title}</span>
                      <span className="mt-0.5 line-clamp-3 whitespace-pre-wrap">
                        <span className="font-medium">Outcome: </span>
                        {data.strongestWork.outcome}
                      </span>
                    </p>
                  )
                }
              />
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-hover)] p-3 text-sm">
              {data.openOpportunities === 0
                ? 'No opportunity is open for entry right now. New ones appear under Opportunities as clients post them.'
                : 'No open opportunity is yours to enter yet. The review on your profile’s Preview tab says what would open one.'}
            </div>
          )}
        </section>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {freelancer ? (
          <>
            <Link href="/opportunities" className="no-underline">
              <Button label="Browse opportunities" icon="pi pi-search" />
            </Link>
            <Link href="/dashboard" className="no-underline">
              <Button label="Your dashboard" icon="pi pi-home" outlined />
            </Link>
          </>
        ) : (
          <>
            <Link href="/client/opportunities/new" className="no-underline">
              <Button label="Post your first brief" icon="pi pi-plus" />
            </Link>
            <Link href="/dashboard" className="no-underline">
              <Button label="Your dashboard" icon="pi pi-home" outlined />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/** One of the four figures: the number large, what it is under it. */
function Box({
  value,
  label,
  title,
  help,
}: {
  value: string;
  label: string;
  title?: string;
  help?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-3 py-4"
      title={title}
    >
      <dd className="text-3xl font-bold tabular-nums text-[var(--primary-color)]">{value}</dd>
      <dt className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]">
        {label}
        {help}
      </dt>
    </div>
  );
}

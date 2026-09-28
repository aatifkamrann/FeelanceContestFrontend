'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { usePortalName } from '@/components/PortalNote';
import SiteHeader from '@/components/SiteHeader';
import { brandingQuery } from '@/lib/api';
import {
  applyQuery,
  submitApplication,
  type ApplicationView,
  type ApplyContext,
} from '@/lib/applications';
import { aiStatusQuery, meQuery } from '@/lib/opportunities';
import { myProfileQuery } from '@/lib/profile';
import ApplyRail, { APPLY_STEPS } from './ApplyRail';
import { initialDraft, type Draft } from './draft';
import {
  ApproachStep,
  AvailabilityStep,
  EligibilityStep,
  MatchStep,
  OpportunityStep,
  PortfolioStep,
  ProfileStep,
  ReviewStep,
} from './steps';
import Submitted from './Submitted';

/**
 * The screen behind "Apply for competition". One read carries everything
 * the eight steps show; the steps collect a draft that lives in session
 * storage until the last step sends it; and once an application is on
 * file the same address shows where it stands instead, with every step
 * ticked.
 */
export default function ApplyScreen({ slug }: { slug: string }) {
  const portal = usePortalName();
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const { data: ctx, isLoading, isError, refetch } = useQuery({ ...applyQuery(slug), enabled: !!me });

  let content: React.ReactNode;
  if (meLoading || (me && isLoading)) {
    content = <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>;
  } else if (!me) {
    content = (
      <Empty icon="pi-lock" title="Sign in to apply">
        <p>Applying reads your own profile against this brief.</p>
        <Link href={`/login?next=${encodeURIComponent(`/opportunities/${slug}/apply`)}`} className="no-underline">
          <Button label="Sign in" icon="pi pi-sign-in" className="mt-4" />
        </Link>
      </Empty>
    );
  } else if (me.role !== 'freelancer') {
    content = (
      <Empty icon="pi-user" title="Only freelancer accounts apply">
        <p>A client reads applications on the opportunity page; an administrator can decide them there too.</p>
        <Link href={`/opportunities/${slug}`} className="no-underline">
          <Button label="Open the opportunity" icon="pi pi-arrow-left" outlined className="mt-4" />
        </Link>
      </Empty>
    );
  } else if (isError) {
    content = (
      <Empty icon="pi-exclamation-triangle" title="This page could not be loaded">
        <p>Nothing was sent — this screen only reads.</p>
        <Button label="Try again" className="mt-4" outlined onClick={() => void refetch()} />
      </Empty>
    );
  } else if (!ctx) {
    content = (
      <Empty icon="pi-search" title="No such opportunity">
        <p>It may be a draft, or gone.</p>
        <Link href="/opportunities" className="no-underline">
          <Button label="Browse opportunities" icon="pi pi-search" className="mt-4" />
        </Link>
      </Empty>
    );
  } else if (ctx.application) {
    content = (
      <RailAndStep current={APPLY_STEPS.length + 1} done={ALL_DONE}>
        <Submitted slug={slug} application={ctx.application} opportunity={ctx.opportunity} portal={portal} />
      </RailAndStep>
    );
  } else {
    content = <Wizard slug={slug} ctx={ctx} portal={portal} />;
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">{content}</main>
    </>
  );
}

const ALL_DONE: ReadonlySet<number> = new Set(APPLY_STEPS.map((_, i) => i + 1));

/** The rail beside the step on a desktop; one line above it on a phone. */
function RailAndStep({
  current,
  done,
  children,
}: {
  current: number;
  done: ReadonlySet<number>;
  children: React.ReactNode;
}) {
  return (
    <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <ApplyRail current={current} done={done} />
      </aside>
      <section className="mt-4 min-w-0 lg:mt-0">{children}</section>
    </div>
  );
}

function Empty({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
      <i className={`pi ${icon} text-3xl text-[var(--text-color-secondary)]`} aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      <div className="mt-1 text-sm text-[var(--text-color-secondary)]">{children}</div>
    </div>
  );
}

/** Where a draft is kept between visits — per opportunity, per tab. */
const storageKey = (slug: string) => `wp.apply.${slug}`;

type Stored = { step: number; done: number[]; draft: Partial<Draft> };

/** The last step an address may open with ?step= — Eligibility; see the read below. */
const ASKABLE_STEPS = 3;

function Wizard({ slug, ctx, portal }: { slug: string; ctx: ApplyContext; portal: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery(myProfileQuery);
  const { data: aiStatus } = useQuery(aiStatusQuery);
  const { data: branding } = useQuery(brandingQuery);
  const captchaSiteKey = branding?.captchaSiteKey ?? null;

  const [step, setStep] = useState(1);
  const [done, setDone] = useState<number[]>([]);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(ctx));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // The draft from an earlier visit, if any — read once, after mount, so
  // the server and the first client render agree.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(slug));
      if (raw) {
        const stored = JSON.parse(raw) as Stored;
        if (stored.step >= 1 && stored.step <= APPLY_STEPS.length) setStep(stored.step);
        setDone(Array.isArray(stored.done) ? stored.done : []);
        setDraft({ ...initialDraft(ctx), ...stored.draft });
      }
    } catch {
      /* storage unavailable: the wizard simply starts fresh */
    }
    // A way back from elsewhere names its step — the verify pages send a
    // member to Eligibility — and wins over the stored one, even in a tab
    // that kept nothing. Only as far as Eligibility: the steps before it
    // only read, so they count as done; the ones after it collect the
    // application. It then leaves the address, so a reload keeps whatever
    // step the member has got to since.
    const asked = Number(new URLSearchParams(window.location.search).get('step'));
    if (Number.isInteger(asked) && asked >= 1 && asked <= ASKABLE_STEPS) {
      setStep(asked);
      setDone((d) => [...new Set([...d, ...Array.from({ length: asked - 1 }, (_, i) => i + 1)])]);
      window.history.replaceState(null, '', window.location.pathname);
    }
    setLoaded(true);
    // The read is for this opportunity only; a fresh context does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(storageKey(slug), JSON.stringify({ step, done, draft } satisfies Stored));
    } catch {
      /* nothing kept between visits, which is only an inconvenience */
    }
  }, [slug, step, done, draft, loaded]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const next = () => {
    setDone((d) => (d.includes(step) ? d : [...d, step]));
    setStep((s) => Math.min(APPLY_STEPS.length, s + 1));
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    if (step === 1) {
      router.push(`/opportunities/${slug}`);
      return;
    }
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const view = await submitApplication(slug, {
        summary: draft.summary,
        approach: draft.approach,
        projectIds: draft.projectIds,
        commitment: draft.commitment,
        hoursPerWeek: draft.hoursPerWeek,
        advantages: draft.advantages,
        githubUsername: ctx.opportunity.needsGithubUsername ? draft.githubUsername : null,
        dedicateTime: draft.dedicateTime,
        onSchedule: draft.onSchedule,
        competitive: draft.competitive,
        originalWork: draft.originalWork,
        captchaToken,
      });
      try {
        sessionStorage.removeItem(storageKey(slug));
      } catch {
        /* already gone, or never kept */
      }
      // The filed application takes the wizard's place at once; the
      // opportunity page's own box learns of it on its next read.
      queryClient.setQueryData(['apply', slug], (old: ApplyContext | null | undefined) =>
        old ? { ...old, application: view satisfies ApplicationView } : old,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['opportunity', slug] }),
        queryClient.invalidateQueries({ queryKey: ['my-applications'] }),
      ]);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The application could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  const common = { ctx, draft, set, portal, onBack: back, onNext: next };
  let body: React.ReactNode;
  switch (step) {
    case 1:
      body = <OpportunityStep {...common} />;
      break;
    case 2:
      body = <MatchStep {...common} />;
      break;
    case 3:
      body = <EligibilityStep {...common} />;
      break;
    case 4:
      body = <ProfileStep {...common} profile={profile ?? null} aiSummary={!!aiStatus?.features.summary} />;
      break;
    case 5:
      body = <ApproachStep {...common} aiApproach={!!aiStatus?.features.approach} />;
      break;
    case 6:
      body = <PortfolioStep {...common} />;
      break;
    case 7:
      body = <AvailabilityStep {...common} />;
      break;
    default:
      body = (
        <ReviewStep
          ctx={ctx}
          draft={draft}
          onBack={back}
          onSubmit={() => void submit()}
          busy={busy}
          error={error}
          captchaSiteKey={captchaSiteKey}
          onCaptcha={setCaptchaToken}
          captchaToken={captchaToken}
        />
      );
  }
  return (
    <RailAndStep current={step} done={new Set(done)}>
      {body}
    </RailAndStep>
  );
}

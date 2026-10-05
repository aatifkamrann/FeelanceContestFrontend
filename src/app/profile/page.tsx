'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { TabPanel, TabView } from 'primereact/tabview';
import HelpIcon from '@/components/HelpIcon';
import IdentityResumeNotice from '@/components/IdentityResumeNotice';
import SignupRail, { signupSteps } from '@/components/SignupRail';
import SiteHeader from '@/components/SiteHeader';
import ProfileReview from '@/components/profile/ProfileReview';
import ProfileView from '@/components/profile/ProfileView';
import { apiUrl } from '@/lib/api';
import { meQuery } from '@/lib/opportunities';
import { myProfileQuery, type MemberProfile } from '@/lib/profile';
import ProfileEditor, { type ProfileSection } from './ProfileEditor';

/**
 * The joining steps this screen hosts, by the rail's numbers: steps one and
 * two are the sign-up form's, and the last is the preview rather than a
 * section of the form.
 */
const GUIDED: Record<number, ProfileSection | null> = {
  3: 'about',
  4: 'expertise',
  5: 'projects',
  6: 'availability',
  7: 'payout',
  8: null,
};
const FIRST_STEP = 3;
const LAST_STEP = 8;

/** The step `?step=` names, or null for the whole form. */
function stepFrom(search: string): number | null {
  const n = Number(new URLSearchParams(search).get('step'));
  return Number.isInteger(n) && n in GUIDED ? n : null;
}

/**
 * A member's own profile: the form on one tab, the page a client sees on the
 * other. Two tabs rather than a separate preview route, because the gap
 * between "what I typed" and "what they read" is exactly what makes people
 * write a better headline.
 *
 * With `?step=` it is instead the rest of joining, one step at a time beside
 * the rail the sign-up form showed: a new freelancer is sent to step three
 * once their code is in. The step lives in the address, so the browser's
 * Back goes back a step, and leaving the setup is going to plain /profile.
 */
export default function ProfilePage() {
  // Read after mount rather than through useSearchParams, which would need a
  // Suspense boundary around the whole page for one optional flag.
  const [welcome, setWelcome] = useState(false);
  // Set by the GitHub callback, which now comes back to whichever screen
  // sent the browser to GitHub rather than always to the client's list.
  const [github, setGithub] = useState<string | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setWelcome(query.get('welcome') === '1');
    setGithub(query.get('github'));
  }, []);
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setStep(stepFrom(window.location.search));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const go = (n: number | null) => {
    window.history.pushState(null, '', n === null ? '/profile' : `/profile?step=${n}`);
    setStep(n);
    // Said on arrival only; a later step, or the whole form, does not repeat it.
    setWelcome(false);
    window.scrollTo({ top: 0 });
  };
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const { data, isLoading } = useQuery({ ...myProfileQuery, enabled: !!me });
  // The save answers with the whole profile, merit score included, so the
  // preview and the score move the moment the form is saved.
  const [saved, setSaved] = useState<MemberProfile | null>(null);
  const profile = saved ?? data ?? null;
  // Only a freelancer's joining ends on this screen; a client's seventh
  // step is a brief, so a client given a step sees the whole form.
  const guided = step !== null && !!me && profile?.role === 'freelancer';

  if (guided && profile)
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <GuidedSetup
            profile={profile}
            step={step}
            go={go}
            welcome={welcome}
            onSaved={setSaved}
          />
        </main>
      </>
    );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-2xl font-bold">Your profile</h1>
          {/* The password is the account's, not the profile's, so it lives
              with the account's other settings; this is the way there. */}
          {me && (
            <Link href="/notifications?tab=settings#password" className="text-sm text-[var(--primary-color)]">
              <i className="pi pi-key mr-1 text-xs" aria-hidden />
              Change password
            </Link>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          {profile && profile.role !== 'freelancer'
            ? 'Who you are and where, for the members you work with.'
            : 'What a client reads before they read your code — and what the portal’s AI features have to work from when they summarise an entry.'}
        </p>

        {meLoading || isLoading ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
        ) : !me ? (
          <div className="mt-6 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">Sign in to write your profile</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              A profile follows your account across every opportunity you enter.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link href="/login?next=%2Fprofile" className="no-underline">
                <Button label="Sign in" icon="pi pi-sign-in" />
              </Link>
              <Link href="/register?next=%2Fprofile" className="no-underline">
                <Button label="Create an account" icon="pi pi-user-plus" outlined />
              </Link>
            </div>
          </div>
        ) : !profile ? (
          <p className="mt-6 text-[var(--text-color-secondary)]">
            Your profile could not be loaded. Reload the page to try again.
          </p>
        ) : (
          <>
            {/* Straight off the sign-up form. Said once, and never again:
                the completeness bar below carries it from here. */}
            {welcome && (
              <div className="mt-6 rounded-xl border border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)] p-4">
                <p className="font-semibold">
                  <i className="pi pi-check-circle mr-2 text-[var(--primary-color)]" aria-hidden />
                  Your account is ready
                </p>
                <p className="mt-1 text-sm">
                  Write a few lines here before you enter your first opportunity. Clients read this
                  beside your board, and an entry from a blank profile is the one they skip.
                </p>
                <Link href="/opportunities" className="no-underline">
                  <Button
                    label="Skip for now — browse opportunities"
                    icon="pi pi-arrow-right"
                    iconPos="right"
                    text
                    size="small"
                    className="mt-2 !px-0"
                  />
                </Link>
              </div>
            )}

            {/* A verification left unfinished, until it is finished or lapses. */}
            <IdentityResumeNotice role={profile.role} returnTo="/profile" />

            {/* The portfolio a freelancer fills in; a client's form has none of it. */}
            {profile.role === 'freelancer' && profile.merit.completeness < 100 && (
              <div className="mt-6 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-hover)] p-4">
                <p className="text-sm font-medium">
                  Your portfolio is {profile.merit.completeness}% filled in
                </p>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-border)]"
                  role="img"
                  aria-label={`${profile.merit.completeness} percent complete`}
                >
                  <div
                    className="h-full rounded-full bg-[var(--primary-color)] transition-[width]"
                    style={{ width: `${profile.merit.completeness}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                  The rest of your merit score is earned on opportunities, not written here — the
                  breakdown under Preview says what each part is worth.
                </p>
                <button
                  type="button"
                  onClick={() => go(FIRST_STEP)}
                  className="mt-2 text-sm text-[var(--primary-color)] hover:underline"
                >
                  Go through it step by step
                </button>
              </div>
            )}

            {/* An account action, not part of the portfolio a client reads,
                so it sits outside the tabs. Hidden where the portal has no
                GitHub sign-in to offer — the same case in which the merit
                breakdown drops those two points rather than showing a
                score nobody here can move. */}
            {profile.githubConnectable && (
              <GitHubRow login={profile.githubLogin} failed={github === 'error'} freelancer={profile.role === 'freelancer'} />
            )}

            <div className="mt-6">
              <TabView>
                <TabPanel header="Edit" leftIcon="pi pi-pencil mr-2">
                  <ProfileEditor profile={profile} onSaved={setSaved} />
                </TabPanel>
                {/* Step eight of joining: the page read back to its owner,
                    with the checklist and the review above it. */}
                <TabPanel header="Preview" leftIcon="pi pi-eye mr-2">
                  <ProfileReview profile={profile} />
                  <div className="mt-6">
                    <ProfileView profile={profile} />
                  </div>
                  {/* After the last step: the screen that says where all
                      of this now stands. */}
                  <div className="mt-8 flex justify-end">
                    <Link href="/welcome" className="no-underline">
                      <Button label="Continue to the Network" icon="pi pi-arrow-right" iconPos="right" />
                    </Link>
                  </div>
                </TabPanel>
              </TabView>
            </div>
          </>
        )}
      </main>
    </>
  );
}

/**
 * The rest of joining: the rail on the left, one section of the same form
 * on the right, then the preview. A step is ticked when the saved profile
 * says it is done (the Profile Strength checklist, under the rail's own
 * names), so skipping one leaves it unticked rather than passed.
 */
function GuidedSetup({
  profile,
  step,
  go,
  welcome,
  onSaved,
}: {
  profile: MemberProfile;
  step: number;
  go: (n: number | null) => void;
  welcome: boolean;
  onSaved: (saved: MemberProfile) => void;
}) {
  const steps = signupSteps(profile.role);
  const done = steps.map(
    (s, i) => profile.strength?.steps.find((x) => x.label === s.label)?.done ?? i < FIRST_STEP - 1,
  );
  const last = step === LAST_STEP;

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <SignupRail
          role={profile.role}
          current={step}
          done={done}
          onPick={go}
          pickFrom={FIRST_STEP}
        />
      </aside>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-2xl font-bold">Set up your profile</h1>
          <button
            type="button"
            onClick={() => go(null)}
            className="text-sm text-[var(--primary-color)] hover:underline"
          >
            Show every section at once
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">{steps[step - 1]?.hint}</p>

        {welcome && step === FIRST_STEP && (
          <div className="mt-6 rounded-xl border border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)] p-4">
            <p className="font-semibold">
              <i className="pi pi-check-circle mr-2 text-[var(--primary-color)]" aria-hidden />
              Your account is ready
            </p>
            <p className="mt-1 text-sm">
              {LAST_STEP - FIRST_STEP + 1} short steps turn it into a page a client will read. Any
              of them can be skipped and finished later from Your profile.
            </p>
            <Link href="/opportunities" className="no-underline">
              <Button
                label="Skip them all — browse opportunities"
                icon="pi pi-arrow-right"
                iconPos="right"
                text
                size="small"
                className="mt-2 !px-0"
              />
            </Link>
          </div>
        )}

        {/* Mounted on every step, the last included, so what was typed on a
            skipped step is still there for a later step's save. */}
        <div className="mt-6" hidden={last}>
          <ProfileEditor
            profile={profile}
            onSaved={onSaved}
            guide={{
              section: GUIDED[step],
              back: step > FIRST_STEP ? () => go(step - 1) : undefined,
              next: () => go(step + 1),
            }}
          />
        </div>

        {last && (
          <div className="mt-6">
            <ProfileReview profile={profile} />
            <div className="mt-6">
              <ProfileView profile={profile} />
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <Button
                label="Back"
                icon="pi pi-arrow-left"
                outlined
                onClick={() => go(LAST_STEP - 1)}
              />
              <Link href="/welcome" className="no-underline">
                <Button label="Continue to the Network" icon="pi pi-arrow-right" iconPos="right" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Connecting GitHub, from the one page that tells a member what their merit
 * score is missing. The portal stores the account's numeric id and treats the
 * username as a cache, so connecting again is both how you move the link to
 * another account and how you refresh a username that was renamed on GitHub.
 */
function GitHubRow({ login, failed, freelancer }: { login: string | null; failed: boolean; freelancer: boolean }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5">
      <i className={`pi pi-github text-2xl ${login ? 'text-[var(--primary-color)]' : ''}`} aria-hidden />
      <div className="min-w-[15rem] flex-1">
        <p className="font-medium">
          {login ? (
            <>
              GitHub connected as <code>@{login}</code>
            </>
          ) : (
            'Connect your GitHub account'
          )}
          <HelpIcon topic="github.connect" label="Connecting GitHub" />
        </p>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          {failed
            ? 'GitHub did not finish the connection, and nothing on your account changed. Try again.'
            : login
              ? (freelancer ? 'Worth two points on your merit score. ' : '') +
                'Connecting again replaces the link — that is how you move it to another account, or refresh a username you renamed on GitHub.'
              : freelancer
                ? 'Worth two points on your merit score, and it is the account a repository opportunity hands work to. Nothing is typed here, so nothing can be mistyped.'
                : 'It is the account a winning repository is handed to once you mark the award paid. Nothing is typed here, so nothing can be mistyped.'}
        </p>
      </div>
      {/* A browser navigation, not a fetch: the portal hands the browser to
          GitHub's consent page and is sent back here by name. */}
      <a href={apiUrl('/api/github/connect?next=%2Fprofile')} className="no-underline">
        <Button
          label={login ? 'Connect a different account' : 'Connect GitHub'}
          icon="pi pi-github"
          outlined={!!login}
          size={login ? 'small' : undefined}
        />
      </a>
    </div>
  );
}

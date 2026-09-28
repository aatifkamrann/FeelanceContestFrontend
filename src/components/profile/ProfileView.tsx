'use client';

import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import Avatar from '@/components/Avatar';
import MeritPanel from '@/components/profile/MeritPanel';
import {
  AVAILABILITIES,
  LANGUAGE_LEVELS,
  PROJECT_DURATIONS,
  PROJECT_TYPES,
  SKILL_LEVELS,
  WORK_TYPES,
  completedOn,
  type MemberProfile,
  type ProfileLanguage,
  type ProfilePayment,
  type ProfileProject,
} from '@/lib/profile';

type View = 'cards' | 'list';
const VIEW_OPTIONS = [
  { icon: 'pi pi-th-large', value: 'cards', label: 'Cards' },
  { icon: 'pi pi-list', value: 'list', label: 'List' },
];
/** How past work is laid out on this device, on every profile read here. */
const VIEW_KEY = 'wp.profile.work.view';

/**
 * The link a project row or card opens from anywhere on it: the title's link
 * laid over the whole box. The screenshots and the two links inside sit above
 * it and open on their own — a link cannot hold another link, so the box
 * itself cannot be one.
 */
const STRETCHED =
  "text-[var(--text-color)] no-underline outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] group-hover:text-[var(--primary-color)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--primary-color)]";

/**
 * A member's portfolio as a page — what the profile looks like to anybody
 * who is not editing it, including its owner between saves. The verified
 * half of somebody's record (the merit panel) sits beside the claimed half
 * (everything above it), and the page never blurs which is which.
 *
 * A search narrows the lists — skills, languages and past work — as it is
 * typed; who the member is, when they can work, how they are paid and what
 * they have earned here stay whole, because they are the member rather than
 * a list about them. Past work shows as rows or as cards.
 */
export default function ProfileView({ profile: whole }: { profile: MemberProfile }) {
  const profile = whole.role === 'freelancer' ? whole : withoutWorkParts(whole);
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('list');
  // The layout is a per-device preference, read after mount so the server
  // render and the first client render agree.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'cards') setView(saved);
    } catch {
      /* private mode, or storage blocked */
    }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* fine — it just will not be remembered */
    }
  };

  const empty =
    !profile.headline &&
    !profile.bio &&
    profile.skills.length === 0 &&
    profile.projects.length === 0;

  // Every word typed must appear in what an item is known by, in any order;
  // part of a word counts.
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const matches = (...fields: (string | null | undefined)[]) => {
    if (!searching) return true;
    const known = fields.filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => known.includes(w));
  };
  const skills = profile.skills.filter((s) =>
    matches(s.name, SKILL_LEVELS.find((l) => l.value === s.level)?.label),
  );
  const languages = profile.languages.filter((l) =>
    matches(l.name, LANGUAGE_LEVELS.find((x) => x.value === l.level)?.label),
  );
  const projects = profile.projects.filter((p) =>
    matches(p.title, p.role, p.category?.label, p.description, p.outcome, p.tech, p.url, p.repoUrl),
  );
  // A client's page has at most a few languages; nothing there to search.
  const hasLists =
    profile.role === 'freelancer' &&
    profile.skills.length + profile.languages.length + profile.projects.length > 0;
  const nothing = searching && skills.length + languages.length + projects.length === 0;
  // While searching, a heading says how much of its list is left.
  const tally = (shown: number, total: number) =>
    searching ? (
      <span className="ml-2 text-sm font-normal tabular-nums text-[var(--text-color-secondary)]">
        {shown} of {total}
      </span>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={profile.displayName} url={profile.avatarUrl} size="lg" />
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
                {profile.displayName}
                {/* The one public thing verification buys: the mark says
                    the provider matched a person to this profile. */}
                {profile.identityVerifiedAtUtc && (
                  <Tag
                    value="Identity verified"
                    icon="pi pi-verified"
                    severity="success"
                    className="text-xs font-medium"
                    title={`Verified ${new Date(profile.identityVerifiedAtUtc).toLocaleDateString()}`}
                  />
                )}
              </h1>
              {profile.headline && <p className="mt-1 text-[var(--text-color)]">{profile.headline}</p>}
              {/* Where, and in which hours, straight under what: the two
                  facts a client with a deadline reads before any other. */}
              {(profile.location || profile.timeZone) && (
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-color-secondary)]">
                  {profile.location && (
                    <span>
                      <i className="pi pi-map-marker mr-1" aria-hidden />
                      {profile.location}
                    </span>
                  )}
                  {profile.timeZone && (
                    <span>
                      <i className="pi pi-globe mr-1" aria-hidden />
                      {profile.timeZone}
                    </span>
                  )}
                </p>
              )}
              {profile.primaryCategory && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {/* The primary kind of work first and filled in, the
                      others outlined: they are not the same claim. */}
                  <li className="rounded-full bg-[var(--surface-border)] px-2 py-0.5 text-xs">
                    {profile.primaryCategory.label}
                  </li>
                  {profile.secondaryCategories.map((c) => (
                    <li
                      key={c.key}
                      className="rounded-full border border-[var(--surface-border)] px-2 py-0.5 text-xs text-[var(--text-color-secondary)]"
                    >
                      {c.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {profile.role === 'freelancer' ? (
            // The score where the role tag was: that this is a freelancer
            // is what the whole page says, and the number is what a client
            // came to it for. The panel at the foot shows the arithmetic.
            <p
              className="flex flex-col items-center rounded-2xl bg-[var(--surface-border)] px-4 py-1.5 leading-tight"
              title={'Merit score ' + profile.merit.score + ' of ' + profile.merit.max + ' — ' + profile.merit.band}
            >
              <span className="text-2xl font-bold tabular-nums text-[var(--primary-color)]">
                {profile.merit.score}
              </span>
              <span className="text-xs text-[var(--text-color-secondary)]">MeritScore</span>
            </p>
          ) : (
            <Tag
              value={profile.role}
              rounded
              style={{ background: 'var(--surface-border)', color: 'var(--text-color-secondary)' }}
            />
          )}
        </div>

        <Facts profile={profile} />

        {profile.bio && (
          <p className="mt-4 whitespace-pre-wrap border-t border-[var(--surface-border)] pt-4 text-sm">
            {profile.bio}
          </p>
        )}

        {empty && (
          <p className="mt-4 text-sm text-[var(--text-color-secondary)]">
            {profile.own
              ? profile.role === 'freelancer'
                ? 'Nothing here yet. What you write is what a client reads before they read your code.'
                : 'Nothing here yet. A headline or an introduction goes in under Edit.'
              : profile.role === 'freelancer'
                ? 'This member has not written a portfolio yet. Their track record below is the portal’s own.'
                : 'This member has not written anything about themselves yet.'}
          </p>
        )}
      </section>

      {/* First after the name, because it is the first thing a client with
          a deadline wants to know. */}
      <AvailabilityCard profile={profile} />

      {hasLists && (
        <div className="flex flex-wrap items-center gap-3">
          {/* No button: the lists below narrow as the box is typed in. */}
          <form role="search" onSubmit={(e) => e.preventDefault()} className="flex min-w-[12rem] flex-1 items-center">
            <span className="relative flex-1">
              <i
                className="pi pi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-color-secondary)]"
                aria-hidden
              />
              <InputText
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search skills, languages and past work"
                className={q ? 'w-full !pl-10 !pr-10' : 'w-full !pl-10'}
                aria-label="Search this profile"
                enterKeyHint="search"
              />
              {q && (
                <Button
                  type="button"
                  icon="pi pi-times"
                  aria-label="Clear search"
                  text
                  rounded
                  size="small"
                  className="wp-search-clear"
                  onClick={() => setQ('')}
                />
              )}
            </span>
          </form>
          {profile.projects.length > 0 && (
            <SelectButton
              value={view}
              onChange={(e) => e.value && chooseView(e.value as View)}
              options={VIEW_OPTIONS}
              optionLabel="label"
              itemTemplate={(o: (typeof VIEW_OPTIONS)[number]) => <i className={o.icon} aria-hidden title={o.label} />}
              allowEmpty={false}
              aria-label="Past work layout"
            />
          )}
        </div>
      )}

      {nothing && (
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
          <i className="pi pi-search text-3xl text-[var(--text-color-secondary)]" aria-hidden />
          <p className="mt-3 font-medium">Nothing matches</p>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            No skill, language or past work on this profile has &ldquo;{q.trim()}&rdquo; in it.
          </p>
          <Button label="Clear search" icon="pi pi-times" text size="small" className="mt-3" onClick={() => setQ('')} />
        </div>
      )}

      {skills.length > 0 && (
        <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6">
          <h2 className="text-lg font-semibold">
            Expertise
            {tally(skills.length, profile.skills.length)}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <li
                key={i}
                className="rounded-full border border-[var(--surface-border)] px-3 py-1 text-sm"
                title={SKILL_LEVELS.find((l) => l.value === s.level)?.hint}
              >
                <span className="font-medium">{s.name}</span>
                <span className="ml-2 text-[var(--text-color-secondary)]">
                  {SKILL_LEVELS.find((l) => l.value === s.level)?.label.toLowerCase()}
                  {s.years > 0 && ` · ${s.years}y`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {languages.length > 0 && (
        <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6">
          <h2 className="text-lg font-semibold">
            Languages
            {tally(languages.length, profile.languages.length)}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {languages.map((l, i) => (
              <LanguageChip key={i} language={l} />
            ))}
          </ul>
        </section>
      )}

      {/* Absent for a viewer who may not read it — a freelancer looking at a
          rival's page is not told there is something here they cannot see. */}
      {(profile.payments !== null || profile.paymentsNote) && <Payments profile={profile} />}

      {projects.length > 0 && (
        <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6">
          <h2 className="text-lg font-semibold">
            Past work
            <span className="ml-2 text-sm font-normal text-[var(--text-color-secondary)]">
              — self-reported, not verified by the portal
            </span>
            {tally(projects.length, profile.projects.length)}
          </h2>
          <ul className={view === 'cards' ? 'mt-4 grid gap-4 sm:grid-cols-2' : 'mt-4 flex flex-col gap-4'}>
            {projects.map((p, i) => (
              <Project key={i} project={p} layout={view === 'cards' ? 'card' : 'row'} />
            ))}
          </ul>
        </section>
      )}

      {/* A score of opportunities entered and won says nothing about a client or
          an administrator, so only a freelancer's page carries one. */}
      {profile.role === 'freelancer' && <MeritPanel merit={profile.merit} own={profile.own} />}
    </div>
  );
}

/**
 * A client's or an administrator's page: who they are and where, their
 * links and languages. What a freelancer is read for — the kinds of work,
 * skills, past work, availability, how they work and for how long — is
 * left off, the same parts their form does not ask for; anything stored
 * from before a change of role stays stored, just not shown.
 */
function withoutWorkParts(profile: MemberProfile): MemberProfile {
  return {
    ...profile,
    primaryCategory: null,
    secondaryCategories: [],
    workType: null,
    yearsExperience: null,
    hoursPerWeek: null,
    availability: null,
    preferredDurations: [],
    preferredProjectTypes: [],
    workingWindow: null,
    skills: [],
    projects: [],
  };
}

function Facts({ profile }: { profile: MemberProfile }) {
  const items: { icon: string; text: string; href?: string }[] = [];
  // Location and time zone sit under the title now; the hours a week are
  // in the availability card with the rest of "when". How they work stays
  // here, with the links.
  const workType = WORK_TYPES.find((w) => w.value === profile.workType);
  if (workType) items.push({ icon: 'pi-user', text: workType.label });
  if (profile.yearsExperience)
    items.push({ icon: 'pi-briefcase', text: `${profile.yearsExperience} years' experience` });
  if (profile.githubLogin)
    items.push({
      icon: 'pi-github',
      text: profile.githubLogin,
      href: `https://github.com/${profile.githubLogin}`,
    });
  if (profile.websiteUrl)
    items.push({ icon: 'pi-link', text: hostOf(profile.websiteUrl), href: profile.websiteUrl });
  if (profile.linkedInUrl)
    items.push({ icon: 'pi-linkedin', text: 'LinkedIn', href: profile.linkedInUrl });
  if (items.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-color-secondary)]">
      {items.map((f) => (
        <li key={f.text} className="min-w-0">
          <i className={`pi ${f.icon} mr-1`} aria-hidden />
          {f.href ? (
            <a
              href={f.href}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="[overflow-wrap:anywhere] text-[var(--primary-color)]"
            >
              {f.text}
            </a>
          ) : (
            f.text
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * When this member can work: the status a client acts on, the hours a week
 * behind it, and the preferences around it. Absent until any of the five
 * is said — a card of "not said" five times tells a client nothing.
 */
function AvailabilityCard({ profile }: { profile: MemberProfile }) {
  const status = AVAILABILITIES.find((a) => a.value === profile.availability);
  const durations = PROJECT_DURATIONS.filter((d) => profile.preferredDurations.includes(d.value));
  const types = PROJECT_TYPES.filter((t) => profile.preferredProjectTypes.includes(t.value));
  const hours = profile.hoursPerWeek;
  if (!status && hours === null && durations.length === 0 && types.length === 0 && !profile.workingWindow)
    return null;

  // Green is the one a client acts on; grey is the one they should not.
  const severity =
    profile.availability === 'now'
      ? 'success'
      : profile.availability === 'unavailable'
        ? 'secondary'
        : 'info';

  return (
    <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6">
      <h2 className="flex flex-wrap items-center gap-3 text-lg font-semibold">
        Availability
        {status && <Tag value={status.label} severity={severity} rounded title={status.hint} />}
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {hours !== null && (
          <div className="contents">
            <dt className="text-[var(--text-color-secondary)]">Weekly capacity</dt>
            <dd className="tabular-nums">
              <span className="font-medium">{hours}</span> hours / week
            </dd>
          </div>
        )}
        {durations.length > 0 && (
          <div className="contents">
            <dt className="text-[var(--text-color-secondary)]">Prefers</dt>
            <dd>
              <ul className="flex flex-wrap gap-1.5">
                {durations.map((d) => (
                  <li
                    key={d.value}
                    className="rounded-full border border-[var(--surface-border)] px-2 py-0.5 text-xs"
                    title={d.hint}
                  >
                    {d.label}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {types.length > 0 && (
          <div className="contents">
            <dt className="text-[var(--text-color-secondary)]">On terms</dt>
            <dd>
              <ul className="flex flex-wrap gap-1.5">
                {types.map((t) => (
                  <li
                    key={t.value}
                    className="rounded-full border border-[var(--surface-border)] px-2 py-0.5 text-xs"
                    title={t.hint}
                  >
                    {t.label}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {profile.workingWindow && (
          <div className="contents">
            <dt className="text-[var(--text-color-secondary)]">Working hours</dt>
            <dd className="tabular-nums">
              {profile.workingWindow}
              {/* The window means nothing without the zone it is kept in. */}
              {profile.timeZone && (
                <span className="ml-1 text-[var(--text-color-secondary)]">{profile.timeZone}</span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function LanguageChip({ language }: { language: ProfileLanguage }) {
  const level = LANGUAGE_LEVELS.find((l) => l.value === language.level);
  return (
    <li
      className="rounded-full border border-[var(--surface-border)] px-3 py-1 text-sm"
      title={level?.hint}
    >
      <span className="font-medium">{language.name}</span>
      <span className="ml-2 text-[var(--text-color-secondary)]">
        {level?.label.toLowerCase()}
      </span>
    </li>
  );
}

/**
 * How this member wants an award paid. The portal never moves the money, so
 * this panel is the whole handover: the client who announced them as a
 * winner reads it, copies what it says, and marks the award paid afterwards.
 *
 * It renders only for a viewer the API was willing to send it to, or to tell
 * something to, and it says who reads it on the page — somebody typing an
 * account number deserves to see, on the same screen, who ends up reading it.
 */
function Payments({ profile }: { profile: MemberProfile }) {
  const rows = profile.payments ?? [];
  return (
    <section
      id="how-to-pay"
      className="scroll-mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6"
    >
      <h2 className="text-lg font-semibold">
        How to pay {profile.own ? 'you' : 'them'}
        <span className="ml-2 align-middle text-sm font-normal text-[var(--text-color-secondary)]">
          <i className="pi pi-lock mr-1" aria-hidden />
          administrators and clients who award {profile.own ? 'you' : 'them'}
        </span>
      </h2>
      {profile.payments === null ? (
        // Held back until the client awards them, or until the member
        // verifies: the client is told which, and not whether there is
        // anything behind it.
        <p className="mt-3 text-sm text-[var(--text-color-secondary)]">
          <i className="pi pi-info-circle wp-note-icon mr-1" aria-hidden />
          {profile.paymentsNote}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-color-secondary)]">
          {profile.own
            ? 'You have not set up a payout method. A client who owes you an award has nothing to copy.'
            : 'This member has not said how they want to be paid yet.'}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {rows.map((row, i) => (
            <PaymentCard key={i} payment={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PaymentCard({ payment }: { payment: ProfilePayment }) {
  return (
    <li className="border-l-2 border-[var(--surface-border)] pl-3">
      <p className="font-medium">
        {payment.methodLabel}
        {payment.label && (
          <span className="ml-2 text-sm font-normal text-[var(--text-color-secondary)]">
            {payment.label}
          </span>
        )}
      </p>
      {payment.unreadable ? (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
          These details could not be read back and have to be entered again.
        </p>
      ) : (
        <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {payment.details.map((d) => (
            <div key={d.key} className="contents">
              <dt className="text-[var(--text-color-secondary)]">{d.label}</dt>
              <dd className="[overflow-wrap:anywhere] font-medium tabular-nums">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

/**
 * One piece of past work, as a row or as a card — the same facts in either.
 * Where it can be seen (its live link, or else its repository) it opens from
 * anywhere on it; a project with neither has nowhere to open and is not a
 * link at all.
 */
function Project({ project, layout }: { project: ProfileProject; layout: 'row' | 'card' }) {
  const finished = completedOn(project.year, project.month);
  const card = layout === 'card';
  const target = project.url ?? project.repoUrl;
  return (
    <li
      className={`${target ? 'group relative transition-colors hover:border-[var(--primary-color)]' : ''} ${
        card
          ? 'flex flex-col rounded-lg border border-[var(--surface-border)] p-4'
          : 'border-l-2 border-[var(--surface-border)] pl-3'
      }`}
    >
      <p className="font-medium">
        {target ? (
          // nofollow and noopener: these are links a stranger typed.
          <a href={target} target="_blank" rel="noreferrer noopener nofollow" className={STRETCHED}>
            {project.title}
          </a>
        ) : (
          project.title
        )}
        {finished && (
          <span className="ml-2 text-sm font-normal tabular-nums text-[var(--text-color-secondary)]">
            {finished}
          </span>
        )}
      </p>
      {/* Only the owner is ever sent one of these, so the line is addressed
          to them: the work is written down, and it is not being shown. */}
      {!project.mayShowPublicly && (
        <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
          <i className="pi pi-eye-slash mr-1" aria-hidden />
          Only you can see this — you have not said you may show it publicly.
        </p>
      )}
      {(project.role || project.category) && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--text-color-secondary)]">
          {project.role}
          {project.category && (
            <span className="rounded-full border border-[var(--surface-border)] px-2 py-0.5 text-xs">
              {project.category.label}
            </span>
          )}
        </p>
      )}
      {project.description && (
        <p className={`mt-1 whitespace-pre-wrap text-sm ${card ? 'line-clamp-4' : ''}`}>{project.description}</p>
      )}
      {/* Labelled, because it answers a different question: the description
          says what the work was, and this says what it did. */}
      {project.outcome && (
        <p className={`mt-1 whitespace-pre-wrap text-sm ${card ? 'line-clamp-3' : ''}`}>
          <span className="font-medium">Outcome: </span>
          {project.outcome}
        </p>
      )}
      {project.images.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {project.images.map((image) => (
            <li key={image.id}>
              {/* The whole picture in its own tab: the row shows a thumbnail,
                  and a screenshot nobody can read the labels on says nothing.
                  Served by this portal, so there is no optimiser to route it
                  through. Above the project's own link, so it opens itself. */}
              <a href={image.url} target="_blank" rel="noreferrer" className="relative z-10 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={`${project.title} — screenshot`}
                  loading="lazy"
                  className={`${card ? 'h-16 w-20' : 'h-24 w-32'} rounded border border-[var(--surface-border)] object-cover`}
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      {project.tech && (
        <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
          <i className="pi pi-wrench mr-1" aria-hidden />
          {project.tech}
        </p>
      )}
      {(project.url || project.repoUrl) && (
        <p className={`flex flex-wrap gap-x-3 text-sm ${card ? 'mt-auto pt-2' : 'mt-1'}`}>
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="relative z-10 [overflow-wrap:anywhere] text-[var(--primary-color)]"
            >
              <i className="pi pi-external-link mr-1" aria-hidden />
              {hostOf(project.url)}
            </a>
          )}
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="relative z-10 [overflow-wrap:anywhere] text-[var(--primary-color)]"
            >
              <i className="pi pi-code mr-1" aria-hidden />
              {hostOf(project.repoUrl)}
            </a>
          )}
        </p>
      )}
    </li>
  );
}

/** The host, so a 300-character URL does not become the line. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

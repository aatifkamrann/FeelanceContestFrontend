'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Avatar from '@/components/Avatar';
import LivePulse from '@/components/LivePulse';
import {
  compactAward,
  count,
  fetchFeed,
  formatAward,
  matchLabel,
  meQuery,
  pulseState,
  timeLeftFigure,
  timelineFigure,
  timelineFrom,
  type OpportunityCard,
  type OpportunityFitResult,
} from '@/lib/opportunities';
import { feedHref } from '@/lib/feed';
import type { LandingData } from '@/lib/landing';
import type { LeaderboardRow } from '@/lib/leaderboard';
import type { TalentCard } from '@/lib/talent';
import CompetitionLoop, { type LoopStep } from './CompetitionLoop';
import HeroFlow, { useFlow, type FlowStage } from './HeroFlow';
import LandingFooter from './LandingFooter';
import LandingHeader from './LandingHeader';
import { landingMenus } from './menus';
import './landing.css';

/** A stagger position, for the children of a [data-stagger] group. */
const at = (i: number) => ({ '--i': i }) as React.CSSProperties;

/**
 * The portal's front door: what it is, what is open right now, how an
 * opportunity runs, how merit is earned, and who leads — every figure on it
 * one the portal recorded, read on the server (lib/landing.ts). Where a
 * section needs a person or an opportunity to show, it shows a real one; where
 * the portal has none yet, the section says so or steps aside.
 *
 * The links go somewhere specific: the menus, the chips and the boards
 * open the opportunities, the talent panels and the leaderboard already
 * narrowed to what was clicked (components/landing/menus.ts).
 */
export default function LandingPage({ data }: { data: LandingData }) {
  const root = useRef<HTMLDivElement>(null);
  useReveals(root);
  const { data: me } = useQuery(meQuery);
  const freelancer = me?.role === 'freelancer';
  const menus = useMemo(() => landingMenus(data.categories), [data.categories]);

  // The opportunity the hero and the loop follow: the newest open one.
  const featured = data.opportunities[0] ?? null;
  const stages = heroStages(featured);
  const flow = useFlow(stages.length);

  // A signed-in freelancer's own best match, for the matching panel.
  const { data: best } = useQuery({
    queryKey: ['landing', 'best-match'],
    queryFn: async () => {
      const page = await fetchFeed({ status: 'open', fit: true });
      const read = page.items.filter((c): c is OpportunityCard & { fit: OpportunityFitResult } => c.fit !== null);
      read.sort((a, b) => Number(b.fit.canEnter) - Number(a.fit.canEnter) || b.fit.match - a.fit.match);
      return read[0] ?? null;
    },
    enabled: freelancer,
    staleTime: 60_000,
  });

  const talent = data.talent;
  const showcase = talent?.top[0] ?? null;

  return (
    <div ref={root} className="lp">
      <LandingHeader menus={menus} />
      <NavDots />
      <main>
        {/* ══ Hero ══ */}
        <section className="lp-wrap lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow" style={{ marginBottom: 16 }}>
              The Talent Performance Network
            </p>
            <h1 className="lp-h1">Where Talent Earns Its Next Opportunity.</h1>
            <p className="lp-hero-lede">
              Compete for real projects with a fixed award, prove your expertise in work the client reads for
              themselves, build your merit, and unlock better opportunities.
            </p>
            <div className="lp-actions">
              <Link href={feedHref()} className="lp-btn lp-btn-primary">
                Explore Opportunities
              </Link>
              {me ? (
                <Link href="/dashboard" className="lp-btn lp-btn-quiet">
                  Your Dashboard
                </Link>
              ) : (
                <Link href="/register" className="lp-btn lp-btn-quiet">
                  Join the Talent Network
                </Link>
              )}
            </div>
            {!flow.still && (
              <button type="button" className="lp-play" onClick={flow.toggle}>
                <span className="lp-play-icon">
                  <i className={`pi ${flow.playing ? 'pi-pause' : 'pi-play'}`} aria-hidden />
                </span>
                {flow.playing ? 'Pause animation' : 'See How It Works'}
              </button>
            )}
          </div>
          <div className="lp-hero-flow">
            <HeroFlow stages={stages} step={flow.step} />
          </div>
        </section>

        {/* ══ What is open now ══ */}
        <section id="opportunities" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-row-head" data-reveal="up">
              <div>
                <h2 className="lp-h2">Opportunities in Motion</h2>
                <p className="lp-lede">Real projects, continuously flowing through the network.</p>
              </div>
              <Link href={feedHref()} className="lp-link">
                View All <i className="pi pi-arrow-right" aria-hidden />
              </Link>
            </div>
            {data.stats && (
              <div className="lp-chips" style={{ marginBottom: 20 }} data-reveal="up">
                <Link href={feedHref()} className="lp-chip">
                  <b>{data.stats.open}</b> open for entry
                </Link>
                <Link href={feedHref({ sort: 'award' })} className="lp-chip">
                  <b>{compactAward(data.stats.rewards, data.stats.currency)}</b> in awards
                </Link>
                <Link href={feedHref({ sort: 'ending' })} className="lp-chip">
                  <b>{data.stats.endingSoon}</b> ending soon
                </Link>
              </div>
            )}
            {data.opportunities.length > 0 ? (
              <div className="lp-grid-3" data-stagger>
                {data.opportunities.slice(0, 3).map((c, i) => (
                  <LandingOpportunityCard key={c.slug} opportunity={c} style={at(i)} />
                ))}
              </div>
            ) : (
              <div className="lp-empty">
                <strong>Nothing is open for entry right now</strong>
                New opportunities appear here the moment a client publishes one.{' '}
                <Link href={me ? '/notifications' : '/register'} className="lp-link">
                  Get told when one opens
                </Link>
              </div>
            )}
            {data.categories.length > 0 && (
              <nav className="lp-browse" aria-label="Browse by category" data-reveal="up">
                <span className="lp-chips-label">Browse by category</span>
                {data.categories.map((c) => (
                  <Link key={c.key} href={feedHref({ category: c.key })} className="lp-chip">
                    {c.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </section>

        {/* ══ The model ══ */}
        <section className="lp-band">
          <div className="lp-wrap lp-section">
            <div className="lp-head" data-reveal="up">
              <p className="lp-eyebrow">A Different Model</p>
              <h2 className="lp-h2">Not a Marketplace Built Around Bidding.</h2>
              <p className="lp-lede">
                A professional talent economy where opportunities are defined, talent is matched, work is
                proven, and merit compounds.
              </p>
            </div>
            <div className="lp-grid-4" data-stagger>
              {PILLARS.map((p, i) => (
                <div key={p.title} className="lp-pillar" style={at(i)}>
                  <div className="lp-num">{i + 1}</div>
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ One opportunity, start to finish ══ */}
        <CompetitionLoop steps={loopSteps(featured)} />

        {/* ══ Matching ══ */}
        <section id="matching" className="lp-band">
          <div className="lp-wrap lp-section lp-split">
            <div data-reveal="left">
              <p className="lp-eyebrow">Matching</p>
              <h2 className="lp-h2">Your Next Opportunity, Calculated.</h2>
              <p className="lp-lede" style={{ marginBottom: 28 }}>
                Every open opportunity is read against your skills, past work, delivery record and availability,
                so you can see where you have the strongest chance of winning before you enter.
              </p>
              <ul className="lp-checks">
                {MATCH_POINTS.map((point) => (
                  <li key={point}>
                    <span className="lp-tick">
                      <i className="pi pi-check" aria-hidden />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <Link href={feedHref({ recommended: true })} className="lp-link">
                See your matches <i className="pi pi-arrow-right" aria-hidden />
              </Link>
            </div>
            <div data-reveal="right">
              {best ? <MatchCard opportunity={best} /> : <MatchExample opportunity={featured} signedIn={!!me} />}
            </div>
          </div>
        </section>

        {/* ══ MeritScore ══ */}
        <section className="lp-wrap lp-section lp-split">
          <div className="lp-score" data-reveal="left">
            <p className="lp-kicker">MeritScore · out of 100</p>
            <div className="lp-score-num">
              <CountUp to={RECORD_POINTS} />
            </div>
            <p className="lp-score-caption">of the points are earned only by doing the work here</p>
            <div className="lp-bars">
              {RECORD_PARTS.map((part) => (
                <div key={part.label} className="lp-bar-row">
                  <span className="lp-bar-label">{part.label}</span>
                  <span className="lp-bar">
                    <span style={{ '--w': `${(part.points / 20) * 100}%` } as React.CSSProperties} />
                  </span>
                  <span className="lp-bar-value">{part.points}</span>
                </div>
              ))}
            </div>
            <p className="lp-score-foot">
              <b>+ {100 - RECORD_POINTS}</b> from your profile — capped, because anyone can write anything.
            </p>
          </div>
          <div data-reveal="right">
            <p className="lp-eyebrow">MeritScore</p>
            <h2 className="lp-h2">Your Work Builds Your Reputation.</h2>
            <p className="lp-lede" style={{ marginBottom: 20 }}>
              Your reputation isn&apos;t based on how well you market yourself. It&apos;s built through the
              work you complete, the quality you deliver, and the consistency you demonstrate.
            </p>
            <p className="lp-small-copy" style={{ fontSize: 14, lineHeight: 1.6 }}>
              Every opportunity you enter, every milestone you meet on time, every win and every client rating
              feeds one transparent number — and every point of it has a line on your profile.
            </p>
          </div>
        </section>

        {/* ══ Leaderboard ══ */}
        <section id="leaderboard" className="lp-band">
          <div className="lp-wrap lp-section">
            <div className="lp-head" data-reveal="up">
              <p className="lp-eyebrow">Leaderboard</p>
              <h2 className="lp-h2">Performance Has a Place on the Board.</h2>
              <p className="lp-lede">Global · Regional · Category rankings, read live from the work.</p>
            </div>
            <Boards data={data} />
            <div className="lp-center" data-reveal="up">
              <Link href="/leaderboard" className="lp-link">
                View Full Leaderboard <i className="pi pi-arrow-right" aria-hidden />
              </Link>
              <nav className="lp-chips" aria-label="Other boards">
                <Link href="/leaderboard?tab=regional" className="lp-chip">
                  <i className="pi pi-map-marker" aria-hidden />
                  Regional
                </Link>
                <Link href="/leaderboard?tab=rising" className="lp-chip">
                  <i className="pi pi-user-plus" aria-hidden />
                  Newest members
                </Link>
                <Link href="/leaderboard?tab=performance" className="lp-chip">
                  <i className="pi pi-chart-line" aria-hidden />
                  Performance Leaders
                </Link>
                <Link href="/leaderboard?by=rating" className="lp-chip">
                  <i className="pi pi-star" aria-hidden />
                  By client rating
                </Link>
                <Link href="/leaderboard?by=delivery" className="lp-chip">
                  <i className="pi pi-clock" aria-hidden />
                  By on-time delivery
                </Link>
                <Link href="/leaderboard?by=wins" className="lp-chip">
                  <i className="pi pi-trophy" aria-hidden />
                  By wins
                </Link>
              </nav>
            </div>
          </div>
        </section>

        {/* ══ Rising talent ══ */}
        {talent && talent.rising.length > 0 && (
          <section className="lp-wrap lp-section">
            <div className="lp-head" data-reveal="up">
              <p className="lp-eyebrow">Rising Talent</p>
              <h2 className="lp-h2">The Next Leaders Are Already Here.</h2>
              <p className="lp-lede">
                Freelancers whose MeritScore climbed fastest in the last {talent.trendDays} days.
              </p>
            </div>
            <div className="lp-grid-4" data-stagger>
              {talent.rising.slice(0, 4).map((m, i) => (
                <RisingCard key={m.userId} member={m} style={at(i)} />
              ))}
            </div>
            <div className="lp-center">
              <Link href="/talent#panel-rising-talent" className="lp-link">
                See all rising talent <i className="pi pi-arrow-right" aria-hidden />
              </Link>
            </div>
          </section>
        )}

        {/* ══ A real profile ══ */}
        {talent && showcase && (
          <section id="talent" className="lp-band">
            <div className="lp-wrap lp-section">
              <div className="lp-head" data-reveal="up">
                <p className="lp-eyebrow">Talent Profiles</p>
                <h2 className="lp-h2">Professional Profiles, Not Commodity Listings.</h2>
              </div>
              <Showcase member={showcase} data={data} />
              <div className="lp-center" data-reveal="up">
                <Link href="/talent" className="lp-link">
                  Explore the talent network <i className="pi pi-arrow-right" aria-hidden />
                </Link>
                <nav className="lp-chips" aria-label="Talent panels">
                  {menus
                    .find((m) => m.key === 'talent')
                    ?.links.map((link) => (
                      <Link key={link.href} href={link.href} className="lp-chip">
                        <i className={`pi ${link.icon}`} aria-hidden />
                        {link.label}
                      </Link>
                    ))}
                </nav>
              </div>
            </div>
          </section>
        )}

        {/* ══ Build. Prove. Rise. ══ */}
        <section className="lp-wrap lp-section">
          <div className="lp-head" data-reveal="up">
            <p className="lp-eyebrow">Career Growth</p>
            <h2 className="lp-h2">Build. Prove. Rise.</h2>
            <p className="lp-lede">Your path through the network.</p>
          </div>
          <ol className="lp-grid-5" data-stagger style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {GROWTH.map((g, i) => (
              <li key={g.title} className="lp-card lp-growth" style={at(i)}>
                <div className="lp-ring">{i + 1}</div>
                <h3 className="lp-small-title">{g.title}</h3>
                <p className="lp-small-copy">{g.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ══ What earns merit ══ */}
        <section className="lp-band">
          <div className="lp-wrap lp-section">
            <div className="lp-head" data-reveal="up">
              <p className="lp-eyebrow">Incentives</p>
              <h2 className="lp-h2">Performance Compounds.</h2>
              <p className="lp-lede">Every line of the MeritScore, and what earns it.</p>
            </div>
            <div className="lp-grid-5" data-stagger>
              {INCENTIVES.map((inc, i) => (
                <div key={inc.action} className="lp-incentive" style={at(i)}>
                  <div className="lp-incentive-action">{inc.action}</div>
                  <i className="pi pi-arrow-down" aria-hidden />
                  <div className="lp-incentive-result">{inc.result}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ Trust ══ */}
        <section className="lp-wrap lp-section">
          <div className="lp-head" data-reveal="up">
            <p className="lp-eyebrow">Trust &amp; Transparency</p>
            <h2 className="lp-h2">Clear Rules. Real Opportunities. Measurable Performance.</h2>
            <p className="lp-lede">Every part of the portal is built for fairness and accountability.</p>
          </div>
          <ul className="lp-grid-4" data-stagger style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {TRUST.map((t, i) => (
              <li key={t} className="lp-card lp-trust" style={at(i)}>
                <span className="lp-tick">
                  <i className="pi pi-check" aria-hidden />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* ══ The close ══ */}
        <section className="lp-night">
          <div className="lp-cta" data-reveal="up">
            <h2 className="lp-h2">Your Next Opportunity Is Waiting to Be Earned.</h2>
            <p className="lp-cta-copy">
              Join a network where your skills, performance and consistency shape what comes next.
            </p>
            <div className="lp-actions">
              <Link href={feedHref()} className="lp-btn lp-btn-light">
                Explore Opportunities
              </Link>
              {me ? (
                <Link href="/dashboard" className="lp-btn lp-btn-primary">
                  Your Dashboard
                </Link>
              ) : (
                <Link href="/register" className="lp-btn lp-btn-primary">
                  Join the Talent Network
                </Link>
              )}
            </div>
            <p className="lp-cta-aside">
              Have work to hand out?{' '}
              <Link href={me?.role === 'client' ? '/client/opportunities/new' : '/register'}>Post an opportunity</Link>
            </p>
          </div>
        </section>
      </main>
      <LandingFooter menus={menus} />
    </div>
  );
}

/* ─── copy that describes the portal itself ─────────────────────────────── */

const PILLARS = [
  {
    title: 'Opportunities Are Defined',
    desc: 'Every opportunity is a structured brief: clear requirements, dated milestones, a fixed award and a deadline.',
  },
  {
    title: 'Talent Is Matched',
    desc: 'Each opportunity is read against your skills, past work and record, so you see where you have the edge.',
  },
  {
    title: 'Work Is Proven',
    desc: 'Qualified freelancers deliver against the same brief. The client reads the work and picks the winner.',
  },
  {
    title: 'Merit Compounds',
    desc: 'Wins, on-time milestones and client ratings raise your MeritScore, your rank and the doors open to you.',
  },
];

const MATCH_POINTS = [
  'Skill-weighted matching — the required skills count double',
  'Your delivery record counts, not your pitch',
  'The weakest line named in one sentence',
  'Merit floor and required skills checked up front',
];

/**
 * The record half of the merit score: what the portal itself watched
 * happen, out of 70 of the 100 points — the other 30 are the profile's,
 * capped. Mirrors Merit.RecordParts on the API (Services/Profiles/Merit.cs);
 * keep the two in step.
 */
const RECORD_PARTS = [
  { label: 'Milestones met on time', points: 20 },
  { label: 'Opportunities won', points: 20 },
  { label: 'Ratings from clients', points: 15 },
  { label: 'Opportunities entered', points: 15 },
];
const RECORD_POINTS = RECORD_PARTS.reduce((sum, p) => sum + p.points, 0);

const GROWTH = [
  { title: 'Join & Build', desc: 'Create your profile: headline, skills and past work.' },
  { title: 'Apply & Compete', desc: 'Enter opportunities matched to your strengths.' },
  { title: 'Deliver & Prove', desc: 'Meet dated milestones and show the quality.' },
  { title: 'Earn & Rank', desc: 'Win the award, raise your MeritScore, climb the board.' },
  { title: 'Unlock & Grow', desc: 'Higher merit opens opportunities with higher floors.' },
];

/** The same lines as RECORD_PARTS, plus the profile's capped share — what each is worth. */
const INCENTIVES = [
  { action: 'Meet milestones on time', result: 'Up to 20 points' },
  { action: 'Win opportunities', result: '10 points a win' },
  { action: 'Earn client ratings', result: 'Up to 15 points' },
  { action: 'Keep entering', result: 'Up to 15 points' },
  { action: 'Complete your profile', result: 'Up to 30 points' },
];

const TRUST = [
  'Verified track records',
  'Defined requirements',
  'Dated milestones',
  'Fixed awards',
  'A private repo per entrant',
  'Work reviewed before payment',
  'Ratings both ways',
  'Administrator oversight',
];

/* ─── the opportunity the hero and the loop follow ──────────────────────────── */

function span(c: OpportunityCard): string {
  return timelineFigure(timelineFrom(c.startsAtUtc, c.publishedAtUtc), c.deadlineUtc);
}

function heroStages(c: OpportunityCard | null): FlowStage[] {
  const award = c ? formatAward(c.awardAmount, c.currency) : null;
  return [
    {
      label: 'Opportunity Published',
      detail: c ? [c.title, award, span(c)].filter(Boolean).join(' · ') : 'A clear brief · a fixed award · a deadline',
    },
    { label: 'Talent Is Matched', detail: 'Skills, past work and record read against the brief' },
    {
      label: 'Qualified Freelancers Compete',
      detail: c
        ? `${count(c.entrantCount, 'entrant')} so far · merit floor and skills checked`
        : 'Merit floor and required skills checked at the door',
    },
    {
      label: 'Work Is Delivered',
      detail: c
        ? `${count(c.milestoneCount, 'milestone')} · ${c.delivery === 'upload' ? 'files handed in' : 'a private repo each'}`
        : 'Dated milestones · a private repo each',
    },
    { label: 'Work Is Evaluated', detail: 'The client reads every entry before paying' },
    {
      label: 'Winner Earns the Award',
      detail: award ? `${award} fixed award · paid to one winner` : 'The fixed award, paid to one winner',
    },
    { label: 'MeritScore Updates', detail: 'Wins, on-time milestones and ratings raise it' },
  ];
}

function loopSteps(c: OpportunityCard | null): LoopStep[] {
  const award = c ? formatAward(c.awardAmount, c.currency) : null;
  return [
    {
      icon: 'pi-briefcase',
      label: 'OPPORTUNITY',
      value: award ?? 'Brief',
      sub: c?.title ?? 'An opportunity is published',
      desc: 'A structured project is published with clear requirements, dated milestones and a fixed award.',
    },
    {
      icon: 'pi-sparkles',
      label: 'MATCH',
      value: '4',
      sub: 'Things read to match you',
      desc: 'Your skills — counted double — past work, delivery record and availability, read against the brief.',
    },
    {
      icon: 'pi-users',
      label: 'COMPETE',
      value: c ? String(c.entrantCount) : 'Open',
      sub: c ? (c.entrantCount === 1 ? 'Entrant so far' : 'Entrants so far') : 'For entry',
      desc: 'Qualified freelancers enter to prove what they can do; the merit floor and required skills are checked at the door.',
    },
    {
      icon: 'pi-list-check',
      label: 'DELIVER',
      value: c ? String(c.milestoneCount) : 'Dated',
      sub: c?.milestoneCount === 1 ? 'Milestone' : 'Milestones',
      desc: 'Every entrant builds against the same milestones, in a private repository of their own.',
    },
    {
      icon: 'pi-eye',
      label: 'EVALUATE',
      value: 'Read',
      sub: 'Every entry, by the client',
      desc: 'The client reviews the work itself — the code or the files — before choosing a winner.',
    },
    {
      icon: 'pi-trophy',
      label: 'WIN',
      value: award ?? 'Award',
      sub: 'Paid to the winner',
      desc: 'The best delivery wins the fixed award; for code, the repository is handed over once it is paid.',
    },
    {
      icon: 'pi-arrow-up',
      label: 'MERIT',
      value: '+10',
      sub: 'MeritScore for a win',
      desc: 'Each of your first two wins adds ten points; milestones met on time and client ratings add more.',
    },
    {
      icon: 'pi-chart-line',
      label: 'RANK',
      value: 'Live',
      sub: 'Leaderboard',
      desc: 'The board reads live. A better record moves you up it — and opens opportunities with higher merit floors.',
    },
  ];
}

/* ─── sections with data ────────────────────────────────────────────────── */

function LandingOpportunityCard({ opportunity: c, style }: { opportunity: OpportunityCard; style?: React.CSSProperties }) {
  const clock = timeLeftFigure(c.entryCloseUtc ?? c.deadlineUtc);
  const kind = [c.categoryLabel, c.subcategoryLabel].filter(Boolean).join(' · ') || 'Open brief';
  return (
    <article className="lp-card lp-lift lp-opp" style={style}>
      <LivePulse state={pulseState(c)} />
      <h3 className="lp-opp-title">{c.title}</h3>
      <p className="lp-opp-cat">{kind}</p>
      <div className="lp-figs">
        <Fig label="Award" value={formatAward(c.awardAmount, c.currency)} />
        <Fig label="Timeline" value={span(c) || '—'} />
        <Fig label="Competitors" value={String(c.entrantCount)} />
        <Fig label={c.entryCloseUtc ? 'Entry closes' : 'Closing'} value={clock || '—'} />
      </div>
      <Link href={`/opportunities/${c.slug}`} className="lp-card-cta">
        View Opportunity
      </Link>
    </article>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="lp-fig">
      <div className="lp-fig-label">{label}</div>
      <div className="lp-fig-value">{value}</div>
    </div>
  );
}

/** A signed-in freelancer's best match among the open opportunities, as the fit reads it. */
function MatchCard({ opportunity: c }: { opportunity: OpportunityCard & { fit: OpportunityFitResult } }) {
  const fit = c.fit;
  return (
    <div className="lp-panel">
      <div className="lp-panel-head">
        <p className="lp-kicker" style={{ margin: 0 }}>
          Recommended for You
        </p>
        <span className="lp-pill">{fit.match}% Match</span>
      </div>
      <h3 className="lp-panel-title">{c.title}</h3>
      <p className="lp-kicker">How you match</p>
      <ul className="lp-reasons">
        {fit.factors.map((f) => (
          <li key={f.key}>
            <i
              className={`pi ${
                f.score === null ? 'pi-minus' : f.score >= 60 ? 'pi-check lp-ok' : 'pi-exclamation-triangle lp-meh'
              }`}
              aria-hidden
            />
            <span>
              <b>{f.label}</b> — {f.detail}
            </span>
          </li>
        ))}
      </ul>
      {!fit.canEnter && fit.reasons[0] ? (
        <div className="lp-warn">
          <i className="pi pi-ban" aria-hidden /> {fit.reasons[0]}
        </div>
      ) : (
        fit.risk && (
          <div className="lp-warn">
            <i className="pi pi-exclamation-triangle" aria-hidden /> {fit.risk}
          </div>
        )
      )}
      <div className="lp-verdict">
        <div>
          <p className="lp-verdict-label">Recommendation</p>
          <p className="lp-verdict-value">{fit.canEnter ? matchLabel(fit.matchBand) : 'Not open to you yet'}</p>
        </div>
        <Link href={`/opportunities/${c.slug}`} className="lp-btn lp-btn-primary lp-btn-sm">
          {fit.canEnter ? 'Apply Now' : 'See Why'}
        </Link>
      </div>
    </div>
  );
}

/**
 * What a match reads, on a real open opportunity, for anybody without a
 * freelancer's profile to read it against: the four lines are the fit's
 * own, filled with this opportunity's asks rather than anyone's answers.
 */
function MatchExample({ opportunity: c, signedIn }: { opportunity: OpportunityCard | null; signedIn: boolean }) {
  const skills = c?.skills.slice(0, 3).join(', ');
  const time = c ? span(c) : '';
  const recommended = feedHref({ recommended: true });
  return (
    <div className="lp-panel">
      <div className="lp-panel-head">
        <p className="lp-kicker" style={{ margin: 0 }}>
          How a match reads
        </p>
        <span className="lp-pill">Example</span>
      </div>
      <h3 className="lp-panel-title">{c?.title ?? 'Any open opportunity'}</h3>
      <p className="lp-kicker">What is read against the brief</p>
      <ul className="lp-reasons">
        <li>
          <i className="pi pi-check lp-ok" aria-hidden />
          <span>
            <b>Expertise in the required skills</b> — {skills || 'whatever the brief names'}, counted double
          </span>
        </li>
        <li>
          <i className="pi pi-check lp-ok" aria-hidden />
          <span>
            <b>Relevant project history</b> — past work{' '}
            {c?.categoryLabel ? `in ${c.categoryLabel}` : 'in the same kind of work'}
          </span>
        </li>
        <li>
          <i className="pi pi-check lp-ok" aria-hidden />
          <span>
            <b>On-time delivery record</b> — milestones met on time here
          </span>
        </li>
        <li>
          <i className="pi pi-check lp-ok" aria-hidden />
          <span>
            <b>Availability in timeline</b> — {time ? `${time} to the deadline` : 'the hours the opportunity needs'}
          </span>
        </li>
      </ul>
      {c && c.minMeritScore > 0 && (
        <div className="lp-warn">
          <i className="pi pi-lock" aria-hidden /> Entry needs a MeritScore of {c.minMeritScore}
        </div>
      )}
      <div className="lp-verdict">
        <div>
          <p className="lp-verdict-label">Recommendation</p>
          <p className="lp-verdict-value">{signedIn ? 'Yours is on every card' : 'Sign in to see yours'}</p>
        </div>
        <Link
          href={signedIn ? recommended : `/login?next=${encodeURIComponent(recommended)}`}
          className="lp-btn lp-btn-primary lp-btn-sm"
        >
          {signedIn ? 'Browse' : 'Sign In'}
        </Link>
      </div>
    </div>
  );
}

function Boards({ data }: { data: LandingData }) {
  const global = data.board?.rows.slice(0, 5) ?? [];
  const cat = data.categoryBoard;
  const catLabel = cat?.categories.find((c) => c.key === cat.category)?.label ?? null;
  const catRows = cat && catLabel ? cat.rows.slice(0, 5) : [];

  if (global.length === 0) {
    return (
      <div className="lp-empty">
        <strong>Nobody is on the board yet</strong>
        The first opportunities won put names here.
      </div>
    );
  }
  return (
    <div className="lp-boards" data-stagger style={catRows.length ? undefined : { maxWidth: 640, margin: '0 auto' }}>
      <Board title="Global Rankings" href="/leaderboard" rows={global} style={at(0)} />
      {catRows.length > 0 && cat?.category && (
        <Board
          title={catLabel!}
          href={`/leaderboard?tab=category&category=${encodeURIComponent(cat.category)}`}
          rows={catRows}
          style={at(1)}
        />
      )}
    </div>
  );
}

function Board({
  title,
  href,
  rows,
  style,
}: {
  title: string;
  href: string;
  rows: LeaderboardRow[];
  style?: React.CSSProperties;
}) {
  return (
    <div className="lp-board" style={style}>
      <div className="lp-board-head">
        <span>{title}</span>
        <Link href={href}>Full board</Link>
      </div>
      {rows.map((r) => (
        <Link key={r.userId} href={`/profile/${r.userId}`} className="lp-board-row">
          <span className={`lp-rank${r.rank === 1 ? ' lp-rank-1' : r.rank === 3 ? ' lp-rank-3' : ''}`}>
            {r.rank ? `#${r.rank}` : '—'}
          </span>
          <Avatar name={r.name} url={r.avatarUrl} size="sm" />
          <div className="lp-who">
            <div className="lp-who-name">{r.name}</div>
            <div className="lp-who-line">{r.headline ?? r.location ?? 'Freelancer'}</div>
          </div>
          <div className="lp-score-cell">
            <b>{r.merit}</b>
            <span>MeritScore</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function RisingCard({ member: m, style }: { member: TalentCard; style?: React.CSSProperties }) {
  const trend = m.trend ?? 0;
  return (
    <Link href={`/profile/${m.userId}`} className="lp-card lp-lift lp-person" style={style}>
      <Avatar name={m.name} url={m.avatarUrl} size="md" />
      <div className="lp-who-name">{m.name}</div>
      <div className="lp-who-line">{m.headline ?? 'Freelancer'}</div>
      <div className="lp-climb" aria-label={`MeritScore from ${m.merit - trend} to ${m.merit}`}>
        <span>{m.merit - trend}</span>
        <i className="pi pi-arrow-right lp-ok" aria-hidden />
        <b>{m.merit}</b>
      </div>
      <div className="lp-up">
        <i className="pi pi-arrow-up" aria-hidden style={{ fontSize: 11 }} /> {trend} point{trend === 1 ? '' : 's'}
      </div>
    </Link>
  );
}

/** The network's top member, as their profile would introduce them — every figure one the portal recorded. */
function Showcase({ member: m, data }: { member: TalentCard; data: LandingData }) {
  const talent = data.talent!;
  const rank = data.board?.rows.find((r) => r.userId === m.userId)?.rank ?? null;
  const leads = talent.leaders.find((l) => l.userId === m.userId);
  const badges = [
    talent.top.some((t) => t.userId === m.userId) && 'Top Talent',
    talent.rising.some((t) => t.userId === m.userId) && 'Rising Talent',
    leads?.categoryLabel && `${leads.categoryLabel} Leader`,
    talent.champions.some((t) => t.userId === m.userId) && 'Delivery Champion',
    m.verified && 'Verified Work',
  ].filter((b): b is string => typeof b === 'string');

  return (
    <div className="lp-profile" data-reveal="scale">
      <div className="lp-profile-top">
        <Avatar name={m.name} url={m.avatarUrl} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lp-profile-name">
            {m.name}
            {m.verified && (
              <span className="lp-verified">
                <i className="pi pi-check" aria-hidden style={{ fontSize: 9 }} /> Verified
              </span>
            )}
          </div>
          <div className="lp-who-line" style={{ fontSize: 14, whiteSpace: 'normal' }}>
            {m.headline ?? 'Freelancer'}
          </div>
          <p className="lp-profile-facts">
            <b>MeritScore {m.merit}</b>
            {rank && <span>Global #{rank}</span>}
            {leads?.categoryLabel && <span>{leads.categoryLabel} #1</span>}
          </p>
        </div>
      </div>
      <div className="lp-stats">
        <div className="lp-stat">
          <b>{m.delivery !== null ? `${m.delivery}%` : '—'}</b>
          <span>On-Time</span>
        </div>
        <div className="lp-stat">
          <b>{m.rating !== null ? m.rating.toFixed(1) : '—'}</b>
          <span>Rating</span>
        </div>
        <div className="lp-stat">
          <b>{m.wins}</b>
          <span>Opportunities Won</span>
        </div>
        <div className="lp-stat">
          <b style={{ textTransform: 'capitalize' }}>{m.band}</b>
          <span>Standing</span>
        </div>
      </div>
      <p className="lp-kicker">Recognition</p>
      <div className="lp-badges">
        {badges.map((b) => (
          <span key={b} className="lp-badge">
            {b}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 22 }}>
        <Link href={`/profile/${m.userId}`} className="lp-link">
          Open the profile <i className="pi pi-arrow-right" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/* ─── motion ────────────────────────────────────────────────────────────── */

/**
 * The scroll reveals: whatever is on screen when the page's script arrives
 * stays as the server drew it, and the rest comes in as it is reached.
 * The marks go on through the DOM rather than state — the elements that
 * carry them have fixed class names, so React never writes over them —
 * and a reader who asked for less motion gets everything at once.
 */
function useReveals(root: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal], [data-stagger]'));
    const show = (t: Element) => t.classList.add('is-in');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      targets.forEach(show);
      el.classList.add('lp-js');
      return;
    }
    const fold = window.innerHeight * 0.9;
    for (const t of targets) if (t.getBoundingClientRect().top < fold) show(t);
    el.classList.add('lp-js');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          show(e.target);
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
    );
    for (const t of targets) if (!t.classList.contains('is-in')) io.observe(t);
    return () => io.disconnect();
  }, [root]);
}

/** The merit card's number, counted up from nought the first time it is on screen. */
function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      return;
    }
    let frame = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / 1200);
          setN(Math.round((1 - Math.pow(1 - p, 3)) * to));
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    // Below the fold it waits at nought; already in view, it counts at once.
    if (el.getBoundingClientRect().top > window.innerHeight) setN(0);
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to]);
  return <span ref={ref}>{n}</span>;
}

const DOTS = [
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'how', label: 'How it works' },
  { id: 'matching', label: 'Matching' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'talent', label: 'Talent' },
];

/** The dots down the right edge on a wide screen: where you are, and a jump to each section. */
function NavDots() {
  const [present, setPresent] = useState(DOTS);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const here = DOTS.filter((d) => document.getElementById(d.id));
    setPresent(here);
    let frame = 0;
    const read = () => {
      frame = 0;
      const mid = window.innerHeight / 2;
      let a = 0;
      here.forEach((d, i) => {
        const el = document.getElementById(d.id);
        if (el && el.getBoundingClientRect().top < mid) a = i;
      });
      setActive(a);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  const go = (id: string) => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
  };
  return (
    <nav className="lp-dots" aria-label="Sections">
      {present.map((d, i) => (
        <button
          key={d.id}
          type="button"
          className="lp-dot"
          title={d.label}
          aria-label={d.label}
          aria-current={i === active ? 'true' : undefined}
          onClick={() => go(d.id)}
        />
      ))}
    </nav>
  );
}

import type { OpportunityCategoryDef } from '@/lib/opportunities';
import { feedHref } from '@/lib/feed';

/** One link in a menu: where it goes, its name, a line on what it opens, and a PrimeIcons glyph. */
export type MenuLink = { href: string; label: string; detail: string; icon: string };

/** A short list beside a menu's links: the categories, the orderings. */
export type MenuAside = { title: string; links: { href: string; label: string }[] };

export type Menu = {
  key: 'opportunities' | 'talent' | 'leaderboard';
  label: string;
  /** Where the menu's own name goes: the page unfiltered. */
  href: string;
  links: MenuLink[];
  aside?: MenuAside;
};

/**
 * The landing page's menus — the header's dropdowns, the phone menu and
 * the footer's columns all draw from this one list. Every link opens its
 * page already narrowed to what it names: the opportunities by order or kind of
 * work (lib/feed.ts), a Talent panel by its anchor, a leaderboard tab or
 * ordering by its address.
 */
export function landingMenus(categories: OpportunityCategoryDef[]): Menu[] {
  return [
    {
      key: 'opportunities',
      label: 'Opportunities',
      href: feedHref(),
      links: [
        { href: feedHref(), label: 'Explore Opportunities', detail: 'Every opportunity open for entry', icon: 'pi-compass' },
        { href: feedHref({ recommended: true }), label: 'Recommended', detail: 'Matched to your strengths', icon: 'pi-sparkles' },
        { href: feedHref({ sort: 'ending' }), label: 'Ending Soon', detail: 'Soonest deadline first', icon: 'pi-clock' },
        { href: feedHref({ sort: 'award' }), label: 'High Reward', detail: 'Largest fixed award first', icon: 'pi-dollar' },
        { href: feedHref({ status: 'all' }), label: 'All Opportunities', detail: 'Awarded and closed ones too', icon: 'pi-history' },
      ],
      aside:
        categories.length > 0
          ? {
              title: 'By category',
              links: categories.map((c) => ({ href: feedHref({ category: c.key }), label: c.label })),
            }
          : undefined,
    },
    {
      key: 'talent',
      label: 'Talent',
      href: '/talent',
      links: [
        { href: '/talent#panel-top-talent', label: 'Top Talent', detail: 'Highest MeritScore', icon: 'pi-star' },
        { href: '/talent#panel-rising-talent', label: 'Rising Talent', detail: 'Fastest-climbing scores', icon: 'pi-arrow-up-right' },
        { href: '/talent#panel-category-leaders', label: 'Category Leaders', detail: 'Number one in each field', icon: 'pi-crown' },
        { href: '/talent#panel-delivery-champions', label: 'Delivery Champions', detail: 'Most milestones met on time', icon: 'pi-check-circle' },
      ],
    },
    {
      key: 'leaderboard',
      label: 'Leaderboard',
      href: '/leaderboard',
      links: [
        { href: '/leaderboard', label: 'Global Rankings', detail: 'Every freelancer by MeritScore', icon: 'pi-globe' },
        { href: '/leaderboard?tab=regional', label: 'Regional', detail: 'Ranked within a region', icon: 'pi-map-marker' },
        { href: '/leaderboard?tab=category', label: 'Category Rankings', detail: 'Leaders by discipline', icon: 'pi-tags' },
        // The board's own name for its tab — the Talent menu's panel of the
        // same name reads the score's climb instead, and says so.
        { href: '/leaderboard?tab=rising', label: 'Rising Talent', detail: 'Members who joined lately', icon: 'pi-user-plus' },
        { href: '/leaderboard?tab=performance', label: 'Performance Leaders', detail: 'Scored by a client', icon: 'pi-chart-line' },
      ],
      aside: {
        title: 'Rank by',
        links: [
          { href: '/leaderboard?by=rating', label: 'Client rating' },
          { href: '/leaderboard?by=delivery', label: 'On-time delivery' },
          { href: '/leaderboard?by=wins', label: 'Competition wins' },
        ],
      },
    },
  ];
}

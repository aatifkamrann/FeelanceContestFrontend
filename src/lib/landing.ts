import { apiBase } from './api';
import type { OpportunityCard, OpportunityCategories, OpportunityCategoryDef, OpportunityFeed, OpportunityStats } from './opportunities';
import type { Leaderboard } from './leaderboard';
import type { Talent } from './talent';

/**
 * Everything the landing page shows that the portal recorded: the opportunities
 * open now, the figures across them, the boards and the talent panels. All
 * public reads — the same the Opportunities, Leaderboard and Talent pages
 * make — taken once on the server so the page arrives whole. A read that
 * fails is null, and the section it feeds says so or steps aside.
 */
export type LandingData = {
  /** The first page of what is open for entry, newest first. */
  opportunities: OpportunityCard[];
  stats: OpportunityStats | null;
  /** The global board by merit score. */
  board: Leaderboard | null;
  /** The category board, on the kind of work with the most members. */
  categoryBoard: Leaderboard | null;
  talent: Talent | null;
  categories: OpportunityCategoryDef[];
};

async function read<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${apiBase()}${path}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function getLandingData(): Promise<LandingData> {
  const [feed, stats, board, categoryBoard, talent, taxonomy] = await Promise.all([
    read<OpportunityFeed>('/api/opportunities?status=open'),
    read<OpportunityStats>('/api/opportunities/stats'),
    read<Leaderboard>('/api/public/leaderboard?tab=global&by=merit'),
    read<Leaderboard>('/api/public/leaderboard?tab=category&by=merit'),
    read<Talent>('/api/public/talent'),
    read<OpportunityCategories>('/api/opportunities/categories'),
  ]);
  return {
    opportunities: feed?.items ?? [],
    stats,
    board,
    categoryBoard,
    talent,
    categories: taxonomy?.categories ?? [],
  };
}

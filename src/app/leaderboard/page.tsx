import { Suspense } from 'react';
import LeaderboardScreen from './LeaderboardScreen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Leaderboard' };

/** Public, like the feed: the board reads its tab and ordering from the address. */
export default function LeaderboardPage() {
  return (
    <Suspense>
      <LeaderboardScreen />
    </Suspense>
  );
}

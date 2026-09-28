import { Suspense } from 'react';
import TalentScreen from './TalentScreen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Talent' };

/** Public, like the leaderboard: the page reads its filters from the address. */
export default function TalentPage() {
  return (
    <Suspense>
      <TalentScreen />
    </Suspense>
  );
}

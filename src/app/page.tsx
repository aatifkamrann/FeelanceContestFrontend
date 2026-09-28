import { redirect } from 'next/navigation';
import { JetBrains_Mono } from 'next/font/google';
import { getSetupStatus } from '@/lib/api';
import { getLandingData } from '@/lib/landing';
import LandingPage from '@/components/landing/LandingPage';

export const dynamic = 'force-dynamic';

// The landing page's figures — scores, ranks, the loop's big numbers — in
// a mono face, downloaded at build time like the portal's own face and
// served from the web bundle. Only this page asks for it.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--lp-mono-face',
});

/*
 * No title of its own: the root layout's default — the portal's configured
 * name, alone — is the right name for the front door.
 */

export default async function HomePage() {
  const status = await getSetupStatus();

  if (status === null) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-8 text-center">
          <i className="pi pi-exclamation-triangle text-4xl text-orange-500" />
          <h1 className="mt-4 text-xl font-semibold">API unreachable</h1>
          <p className="mt-2 text-[var(--text-color-secondary)]">
            The web tier is up but couldn&apos;t reach the API. In compose, check{' '}
            <code>docker compose logs api</code>; bare-metal, make sure{' '}
            <code>dotnet run</code> is listening on :8080.
          </p>
        </div>
      </main>
    );
  }

  if (!status.completed) redirect('/setup');

  const data = await getLandingData();

  return (
    <div className={mono.variable}>
      <LandingPage data={data} />
    </div>
  );
}

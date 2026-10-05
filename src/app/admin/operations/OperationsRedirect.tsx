'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Operations was one page of five panels until 1 October 2026; each panel
 * is now a page of its own under it. A bookmark or an older link to the
 * console still lands — on the page its #panel named, or on the first.
 * The redirect runs here because only the browser sees the hash.
 */
const PAGES: Record<string, string> = {
  repositories: 'repositories',
  handovers: 'awards',
  deliveries: 'webhooks',
  'slow-queries': 'queries',
  'ai-usage': 'ai-usage',
};

export default function OperationsRedirect() {
  const router = useRouter();
  useEffect(() => {
    const page = PAGES[window.location.hash.slice(1)] ?? 'repositories';
    router.replace(`/admin/operations/${page}`);
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <i className="pi pi-spinner pi-spin text-3xl" aria-hidden />
    </main>
  );
}

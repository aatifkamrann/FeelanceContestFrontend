import { getPrivacy } from '@/lib/api';
import SiteHeader from '@/components/SiteHeader';
import TermsText from '@/components/TermsText';
import { splitTermsTitle } from '@/lib/terms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Privacy policy' };

/**
 * What the portal collects and what becomes of it, readable without an
 * account — the join form links here beside the terms, and somebody
 * deciding whether to hand over an email address is by definition not
 * signed in yet. Written by the operator in Settings; a portal that has
 * not written one says so rather than showing a blank page or, worse,
 * boilerplate describing somebody else's portal.
 */
export default async function PrivacyPage() {
  const privacy = await getPrivacy();
  // The document's own opening heading becomes the page's, shown once —
  // the same lift the terms page does.
  const doc = privacy?.markdown ? splitTermsTitle(privacy.markdown) : null;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">{doc?.title ?? 'Privacy policy'}</h1>
        {doc ? (
          <section className="mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6">
            <TermsText markdown={doc.body} />
          </section>
        ) : (
          <p className="mt-2 text-[var(--text-color-secondary)]">
            This portal has not published a privacy policy.
          </p>
        )}
      </main>
    </>
  );
}

import { getTerms } from '@/lib/api';
import SiteHeader from '@/components/SiteHeader';
import TermsText from '@/components/TermsText';
import { splitTermsTitle, STOCK_TERMS_TITLE } from '@/lib/terms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Terms of service' };

/**
 * The published terms, readable without an account: the signup form links
 * here, and so does the settings screen, so the administrator sees what an
 * entrant sees. A portal with no terms says so rather than showing a blank.
 */
export default async function TermsPage() {
  const terms = await getTerms();
  // The document's own opening heading becomes the page's, shown once.
  const doc = terms?.markdown ? splitTermsTitle(terms.markdown) : null;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">{doc?.title ?? STOCK_TERMS_TITLE}</h1>
        {doc ? (
          <>
            <p className="text-sm text-[var(--text-color-secondary)]">Version {terms?.version}</p>
            <section className="mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6">
              <TermsText markdown={doc.body} />
            </section>
          </>
        ) : (
          <p className="mt-2 text-[var(--text-color-secondary)]">
            This portal has not published terms of service.
          </p>
        )}
      </main>
    </>
  );
}

'use client';

import { PrimeReactProvider } from 'primereact/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import ConfirmGate from '@/components/ConfirmGate';
import Favicon from '@/components/Favicon';
import SiteFooter from '@/components/SiteFooter';
import TermsGate from '@/components/TermsGate';
import VisitBeacon from '@/components/VisitBeacon';
import ChatDock from '@/components/chat/ChatDock';
import { brandingQuery, type Branding } from '@/lib/api';
import { meQuery, type Me } from '@/lib/opportunities';

export default function Providers({
  branding,
  me,
  children,
}: {
  /** What the root layout read for this request; null when the API was unreachable. */
  branding: Branding | null;
  /** The account the request's cookie names; null for a visitor, or when the API was unreachable. */
  me: Me | null;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
      },
    });
    // The layout's reads seed the branding and account queries, so the
    // header, the brand mark, the tab icon and the gates draw the same
    // name, logo and menus on the server and at hydration alike, and the
    // client is spared those first two fetches. This runs once per page
    // load: the layout, and so this provider, survives client-side
    // navigation. A visitor's null account is seeded too: it is an answer,
    // and the header must not ask again mid-hydration and get a different
    // one. A missing branding is not seeded — it means the API was away.
    if (branding) client.setQueryData(brandingQuery.queryKey, branding);
    if (branding) client.setQueryData(meQuery.queryKey, me);
    return client;
  });

  return (
    <PrimeReactProvider>
      <QueryClientProvider client={queryClient}>
        {/* The page, then the footer under it: the shell (globals.css)
            keeps the footer at the foot of the window on a short page. */}
        <div className="wp-shell">
          <div className="wp-page">{children}</div>
          <SiteFooter />
        </div>
        {/* Under the query provider, above every page: the acceptance
            prompt for terms newer than the account's, wherever they land. */}
        <TermsGate />
        {/* And before it in the order of things: an account that never
            entered its code can accept nothing until it does. */}
        <ConfirmGate />
        {/* The tab icon follows the brand: uploaded logo, Logo URL, stock trophy. */}
        <Favicon />
        {/* Every navigation, signed in or not, is a row in Admin → Activity. */}
        <VisitBeacon />
        {/* The conversations at the corner of every page, for a client or a
            freelancer with one to have; it renders nothing for anyone else. */}
        <ChatDock />
      </QueryClientProvider>
    </PrimeReactProvider>
  );
}

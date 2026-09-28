'use client';

import { useEffect, useState } from 'react';
import { TabPanel, TabView } from 'primereact/tabview';

export type OpportunityTab = {
  /** Stable, and the hash a link opens the tab by: /opportunities/slug#milestones. */
  key: string;
  header: string;
  icon: string;
  count?: number;
  body: React.ReactNode;
};

/**
 * The brief, the milestones and the entrants as three tabs over one card.
 * The bodies arrive rendered from the server; this only chooses which one
 * shows. The chosen tab rides the URL's hash, so a link can open the page
 * on the milestones, and a refresh keeps the place.
 */
export default function OpportunityTabs({ tabs }: { tabs: OpportunityTab[] }) {
  const [index, setIndex] = useState(0);
  const keys = tabs.map((t) => t.key).join(',');
  useEffect(() => {
    // On arrival, and again whenever the hash moves — a link on the page
    // to #entrants changes the hash without remounting anything.
    const follow = () => {
      const at = keys.split(',').indexOf(window.location.hash.slice(1));
      if (at >= 0) setIndex(at);
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [keys]);

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)]">
      <TabView
        activeIndex={index}
        onTabChange={(e) => {
          setIndex(e.index);
          const key = tabs[e.index]?.key;
          const url = window.location.pathname + window.location.search + (e.index > 0 && key ? `#${key}` : '');
          window.history.replaceState(null, '', url);
        }}
        panelContainerClassName="!px-5 !pb-5 !pt-4"
      >
        {tabs.map((t) => (
          <TabPanel
            key={t.key}
            leftIcon={`pi ${t.icon} mr-2`}
            header={
              <span className="flex items-center gap-2">
                {t.header}
                {t.count !== undefined && (
                  <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--text-color-secondary)]">
                    {t.count}
                  </span>
                )}
              </span>
            }
          >
            {t.body}
          </TabPanel>
        ))}
      </TabView>
    </section>
  );
}

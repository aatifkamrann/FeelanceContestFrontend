'use client';

import { useQuery } from '@tanstack/react-query';
import { brandingQuery, PORTAL_NAME } from '@/lib/api';

/**
 * The portal speaking in the first person inside a form, under its own
 * name — the one from Settings, so a portal called anything else is never
 * addressed by a name it does not have. The body is whatever the form has
 * to say; `actions` is the row of buttons a note that does something puts
 * under it. Styles live in globals.css under `.portal-note`.
 */
export function usePortalName(): string {
  const { data } = useQuery(brandingQuery);
  return data?.portalName ?? PORTAL_NAME;
}

export default function PortalNote({
  children,
  actions,
  className,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const name = usePortalName();
  return (
    <aside className={`portal-note${className ? ' ' + className : ''}`}>
      <p className="portal-note-name">
        <span aria-hidden>✦</span> {name}
      </p>
      <div className="portal-note-body">{children}</div>
      {actions && <div className="portal-note-actions">{actions}</div>}
    </aside>
  );
}

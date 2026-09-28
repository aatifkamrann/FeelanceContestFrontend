'use client';

import { Tag } from 'primereact/tag';
import { STATUS_KEYS } from '@/lib/theme';
import { statusLabel } from '@/lib/opportunities';

/**
 * The one badge for an opportunity status. Its colour is a CSS variable the
 * theme engine owns (--wp-status-<status>), so the viewer's choice in the
 * theme popover reaches every list at once, and before first paint on the
 * next visit. A status the picker does not know falls back to the stock
 * blue rather than the accent.
 */
export default function StatusTag({ status, className }: { status: string; className?: string }) {
  const known = (STATUS_KEYS as readonly string[]).includes(status);
  return (
    <Tag
      value={statusLabel(status)}
      rounded
      severity={known ? undefined : 'info'}
      className={className}
      style={
        known
          ? { background: `var(--wp-status-${status})`, color: `var(--wp-status-${status}-text)` }
          : undefined
      }
    />
  );
}

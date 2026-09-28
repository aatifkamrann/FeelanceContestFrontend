'use client';

import { useQuery } from '@tanstack/react-query';
import { brandingQuery } from '@/lib/api';

/**
 * The portal's mark, wherever the brand appears. Two things can be drawn:
 * the logo — the uploaded one, else the Logo URL from Settings — and the
 * tab icon, which is the uploaded icon when there is one and the logo
 * otherwise. With neither, the trophy the portal wears out of the box.
 * One component, so the rail, the header and the sign-in frame can never
 * disagree about which logo it is.
 */
export default function BrandMark({
  use = 'logo',
  imgClassName,
  iconClassName,
}: {
  /** Which of the two the caller wants; only the Settings preview asks for the icon. */
  use?: 'logo' | 'icon';
  /** Sizing for a real image — height and a ceiling on width. */
  imgClassName: string;
  /** Sizing for the stand-in trophy. */
  iconClassName: string;
}) {
  const { data } = useQuery(brandingQuery);
  const src = use === 'icon' ? data?.iconUrl : data?.logoUrl;
  if (src) {
    // A plain <img>: the source is whatever the administrator uploaded or
    // linked, at whatever size, and it must show on the first paint of a
    // page — not after an optimiser has fetched and resized it.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`shrink-0 object-contain ${imgClassName}`} />;
  }
  return <i className={`pi pi-trophy shrink-0 text-[var(--primary-color)] ${iconClassName}`} aria-hidden />;
}

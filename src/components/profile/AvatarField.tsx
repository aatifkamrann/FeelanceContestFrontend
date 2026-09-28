'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import Avatar from '@/components/Avatar';
import HelpIcon from '@/components/HelpIcon';
import type { AvatarChange } from '@/lib/profile';

/** The square the browser shrinks a picture to before it is sent. */
const SIDE = 256;

/**
 * The chosen file as a small square JPEG data URL. The centre square of the
 * picture, scaled down in the browser — so a phone photo of several
 * megabytes leaves as a few tens of kilobytes, and the API's ceiling is a
 * guard rather than something anyone meets. Painted on white first, so a
 * transparent PNG does not come out on black.
 */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('That file is not a picture.'));
      img.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (side === 0) throw new Error('That file is not a picture.');
    const canvas = document.createElement('canvas');
    canvas.width = SIDE;
    canvas.height = SIDE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The picture could not be prepared in this browser.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIDE, SIDE);
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      SIDE,
      SIDE,
    );
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The profile picture, as one field of the form. Nothing is uploaded on
 * its own: the choice rides the same save as the rest — absent leaves the
 * stored picture alone, a new one replaces it, remove clears it — so a
 * closed tab changes nothing, like every other field here.
 */
export default function AvatarField({
  name,
  currentUrl,
  value,
  onChange,
}: {
  /** For the initial, while there is no picture. */
  name: string;
  /** What is saved now. */
  currentUrl: string | null;
  /** What the form will save: nothing yet, a new picture, or a removal. */
  value: AvatarChange | undefined;
  onChange: (change: AvatarChange | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // What the circle shows: the picture about to be saved, nothing if it is
  // about to be removed, else whatever is saved now.
  const shown = value === undefined ? currentUrl : 'remove' in value ? null : value.dataBase64;
  const pending =
    value === undefined ? null : 'remove' in value ? 'Removed when you save.' : 'Saved with the form.';

  // A new choice reopens the picker with nothing selected, so choosing the
  // same file twice in a row still counts.
  useEffect(() => {
    if (value === undefined && input.current) input.current.value = '';
  }, [value]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange({ dataBase64: await shrink(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="font-medium">
        Profile image
        <HelpIcon topic="profile.photo" label="Choosing a picture" />
      </p>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        Clear face · Good lighting · Professional appearance
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Avatar name={name} url={shown} size="lg" />
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        <Button
          type="button"
          label={shown ? 'Change photo' : 'Choose photo'}
          icon="pi pi-camera"
          size="small"
          outlined
          loading={busy}
          onClick={() => input.current?.click()}
        />
        {shown && (
          <Button
            type="button"
            label="Remove"
            icon="pi pi-times"
            size="small"
            text
            severity="secondary"
            onClick={() => onChange(currentUrl ? { remove: true } : undefined)}
          />
        )}
        {value !== undefined && (
          <Button
            type="button"
            label="Undo"
            size="small"
            text
            severity="secondary"
            onClick={() => onChange(undefined)}
          />
        )}
        {pending && <span className="text-xs text-[var(--text-color-secondary)]">{pending}</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

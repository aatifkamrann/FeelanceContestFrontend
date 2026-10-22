'use client';

import { useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { MAX_PROJECT_IMAGES, isStoredImage, type ProjectImageDraft } from '@/lib/profile';

/** The box a picture is shrunk to fit before it is sent. */
const FIT = 1280;

/**
 * The chosen file as a JPEG data URL no wider or taller than {@link FIT}.
 * Shrunk in the browser, so a 6-megapixel screenshot leaves as a couple of
 * hundred kilobytes and the API's ceiling is a guard rather than something
 * anybody meets. The whole picture, not a crop — a screenshot with its edges
 * cut off is a screenshot nobody can read — painted on white first, so a
 * transparent PNG does not arrive on black.
 */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`“${file.name}” is not a picture.`));
      img.src = url;
    });
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w === 0 || h === 0) throw new Error(`“${file.name}” is not a picture.`);
    const scale = Math.min(1, FIT / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The picture could not be prepared in this browser.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const src = (image: ProjectImageDraft) => (isStoredImage(image) ? image.url : image.dataBase64);

/**
 * The screenshots on one project. Nothing is uploaded on its own: a picture
 * chosen here rides the same save as the rest of the form, like the profile
 * picture and every other field — so a closed tab changes nothing. What is
 * already saved travels back as an id rather than as its bytes, which is why
 * the two kinds of entry look different in the draft and identical here.
 */
export default function ProjectImages({
  value,
  onChange,
  what,
}: {
  value: ProjectImageDraft[];
  onChange: (next: ProjectImageDraft[]) => void;
  /** Names the project in the labels a screen reader reads out. */
  what: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const room = MAX_PROJECT_IMAGES - value.length;

  const take = async (files: FileList | null) => {
    const chosen = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (chosen.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      // Whatever is over the limit is left rather than silently dropped
      // among the ones that were taken: the count is the member's to fix.
      if (chosen.length > room) {
        setError(`${MAX_PROJECT_IMAGES} pictures is the most one project shows.`);
      }
      const taken: ProjectImageDraft[] = [];
      for (const file of chosen.slice(0, Math.max(0, room))) {
        taken.push({ dataBase64: await shrink(file) });
      }
      if (taken.length > 0) onChange([...value, ...taken]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be read.');
    } finally {
      setBusy(false);
      // So choosing the same file twice in a row still counts.
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="mt-2">
      <p className="text-sm font-medium">Images / Screenshots</p>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void take(e.target.files)}
      />
      <button
        type="button"
        className={`mt-1 w-full rounded-lg border border-dashed p-4 text-sm transition-colors ${
          over
            ? 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_5%,transparent)]'
            : 'border-[var(--surface-border)] text-[var(--text-color-secondary)]'
        } ${room === 0 ? 'cursor-not-allowed opacity-60' : 'hover:border-[var(--primary-color)]'}`}
        disabled={room === 0 || busy}
        aria-label={`Add pictures to ${what}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <span>
            <i className="pi pi-spin pi-spinner mr-2" aria-hidden />
            Preparing…
          </span>
        ) : room === 0 ? (
          <span>All {MAX_PROJECT_IMAGES} pictures added — remove one to choose another.</span>
        ) : (
          <span>+ Drag images here or click to upload</span>
        )}
      </button>
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {value.map((image, i) => (
            <li key={isStoredImage(image) ? image.id : i} className="relative">
              {/* Somebody's own upload, from this browser or this portal —
                  next/image would route it through the optimiser for no gain. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src(image)}
                alt={`${what}, picture ${i + 1}`}
                className="h-20 w-28 rounded border border-[var(--surface-border)] object-cover"
              />
              <Button
                type="button"
                icon="pi pi-times"
                rounded
                size="small"
                severity="danger"
                className="!absolute -top-2 -right-2 !h-6 !w-6"
                aria-label={`Remove picture ${i + 1} from ${what}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              />
              {!isStoredImage(image) && (
                <span className="sr-only">Saved with the form.</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

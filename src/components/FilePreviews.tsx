'use client';

import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import { Image } from 'primereact/image';
import { fileIcon, formatBytes, type PreviewFile } from '@/lib/opportunities';
import { apiFetch, apiUrl } from '@/lib/api';

/** Rows a CSV preview shows under its header before it asks for the download. */
const MAX_ROWS = 100;

/** Whose files: a brief's attachments or an entrant's, each behind its own download and view links. */
type Source = 'attachments' | 'submissions';

const link = (source: Source, f: PreviewFile, as: 'view' | 'download') => apiUrl(`/api/${source}/${f.id}/${as}`);

/**
 * Stored files, shown rather than listed wherever a browser can: pictures
 * that open larger on a click, a PDF in the browser's own viewer, video and
 * audio in players, and text (notes, CSV, JSON, Markdown) read in the page.
 * Anything else stays a link, and every preview keeps its download beside it.
 *
 * One component wherever files are read: a brief's attachments on the
 * opportunity page and in the draft editor, and an entrant's files in their own
 * upload panel, the client's review and the winner's handover. What a client
 * attaches and what an entrant hands in look the same to both of them.
 *
 * Previews load from the file's /view link, which checks the viewer exactly
 * as its download does and redirects to a five-minute link signed for the
 * type the preview names; text, which the page reads itself, comes from
 * /text, served by the API as plain text. The download is still the file
 * as uploaded.
 *
 * Divs, not lists: the brief's prose styles reach every ul and li under it.
 */
export default function FilePreviews<F extends PreviewFile>({
  files,
  source,
  narrow = false,
  locked = false,
  detail,
  action,
}: {
  files: F[];
  source: Source;
  /** For the opportunity page's side column: two pictures a row, a shorter PDF, and names on a line of their own. */
  narrow?: boolean;
  /**
   * The viewer cannot open these: names and sizes only. Every preview
   * source is a link that sends a signed-out browser to the login page, so
   * previewing one would put the login page in a picture frame.
   */
  locked?: boolean;
  /** A note beside a file's size: when it was handed in, the milestone it claimed. */
  detail?: (file: F) => React.ReactNode;
  /** A control beside a file's download: a remove button. */
  action?: (file: F) => React.ReactNode;
}) {
  const images = locked ? [] : files.filter((f) => f.preview === 'image');
  const panels = locked ? [] : files.filter((f) => f.preview !== null && f.preview !== 'image');
  const links = locked ? files : files.filter((f) => f.preview === null);
  const line = { source, narrow, detail, action };
  return (
    <div className="mt-2 flex flex-col gap-4">
      {images.length > 0 && (
        <div className={`grid grid-cols-2 ${narrow ? 'gap-2' : 'gap-3 sm:grid-cols-3'}`}>
          {images.map((f) => (
            <div key={f.id} className="min-w-0">
              <Image
                src={link(source, f, 'view')}
                alt={f.fileName}
                preview
                className="block"
                imageClassName={`${narrow ? 'h-28' : 'h-40'} w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-ground)] object-contain`}
              />
              <FileLine file={f} compact {...line} />
            </div>
          ))}
        </div>
      )}

      {panels.map((f) => (
        <figure key={f.id} className="min-w-0">
          <FileLine file={f} {...line} />
          <div className="mt-1.5">
            {f.preview === 'pdf' && (
              <object
                data={link(source, f, 'view')}
                type="application/pdf"
                aria-label={f.fileName}
                className={`${narrow ? 'h-80' : 'h-[28rem] sm:h-[36rem]'} w-full rounded-md border border-[var(--surface-border)]`}
              >
                <Unavailable href={link(source, f, 'download')} why="This browser does not show PDFs inside a page." />
              </object>
            )}
            {f.preview === 'video' && (
              <video
                controls
                preload="metadata"
                src={link(source, f, 'view')}
                className="max-h-[28rem] w-full rounded-md bg-black"
              />
            )}
            {f.preview === 'audio' && (
              <audio controls preload="metadata" src={link(source, f, 'view')} className="w-full" />
            )}
            {f.preview === 'text' && <TextPreview file={f} source={source} />}
          </div>
        </figure>
      ))}

      {links.length > 0 && (
        <div className="flex flex-col gap-1">
          {links.map((f) => (
            <FileLine key={f.id} file={f} {...line} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The name and size with the download, a note and a control: over a preview,
 * under a picture, or the whole row for a file with neither. Under a picture
 * and in the narrow column the name takes a line of its own, so a small tile
 * still says what it is.
 */
function FileLine<F extends PreviewFile>({
  file,
  source,
  compact = false,
  narrow,
  detail,
  action,
}: {
  file: F;
  source: Source;
  compact?: boolean;
  narrow: boolean;
  detail?: (file: F) => React.ReactNode;
  action?: (file: F) => React.ReactNode;
}) {
  const download = link(source, file, 'download');
  const label = `Download ${file.fileName}`;
  const note = detail?.(file);
  const name =
    file.preview === null ? (
      <a href={download} className="min-w-0 truncate text-[var(--primary-color)]">
        {file.fileName}
      </a>
    ) : (
      <span className="min-w-0 truncate text-[var(--text-color)]" title={file.fileName}>
        {file.fileName}
      </span>
    );
  const icon = !compact && (
    <i className={`pi ${fileIcon(file.contentType)} text-[var(--text-color-secondary)]`} aria-hidden />
  );
  const meta = (
    <>
      <span className="shrink-0 text-xs text-[var(--text-color-secondary)]">{formatBytes(file.sizeBytes)}</span>
      {note ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-color-secondary)]">{note}</span>
      ) : null}
      {file.preview !== null && (
        <a
          href={download}
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-[var(--primary-color)]"
          title={label}
          aria-label={label}
        >
          <i className="pi pi-download text-xs" aria-hidden />
          {!compact && 'Download'}
        </a>
      )}
      {action && <span className={`shrink-0 ${file.preview === null ? 'ml-auto' : ''}`}>{action(file)}</span>}
    </>
  );

  if (compact || narrow)
    return (
      <div className={`min-w-0 ${compact ? 'mt-1 text-xs' : 'text-sm'}`}>
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          {name}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">{meta}</div>
      </div>
    );
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      {icon}
      {name}
      {meta}
    </div>
  );
}

function Unavailable({ href, why }: { href: string; why: string }) {
  return (
    <div className="rounded-md bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text-color-secondary)]">
      {why}{' '}
      <a href={href} className="text-[var(--primary-color)]">
        Download it
      </a>{' '}
      to read it.
    </div>
  );
}

/**
 * Text is fetched and shown in the page: Markdown rendered as a brief is,
 * CSV as a table, JSON indented, anything else as it stands. The API only
 * names a text preview up to 1 MB, so the whole file is a glance.
 */
function TextPreview({ file, source }: { file: PreviewFile; source: Source }) {
  const src = `/api/${source}/${file.id}/text`;
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    // From the API, which reads the store itself: the page never fetches
    // the bucket, so it needs no CORS rule and no reachable public address
    // for this.
    apiFetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => {
        if (live) setText(t.replace(/^\uFEFF/, ''));
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [src]);

  if (failed) return <Unavailable href={link(source, file, 'download')} why="The preview could not load." />;
  if (text === null)
    return (
      <div
        className="h-24 animate-pulse rounded-md bg-[var(--surface-hover)]"
        role="status"
        aria-label={`Loading ${file.fileName}`}
      />
    );

  const box = 'max-h-80 overflow-auto rounded-md border border-[var(--surface-border)] bg-[var(--surface-ground)]';
  // Markdown brings its own prose styles: outside the brief nothing around it lends them.
  if (file.contentType === 'text/markdown')
    return (
      <div
        className={`${box} px-4 py-3 text-sm [&>:first-child]:mt-0 [&_h4]:mt-3 [&_h4]:font-semibold [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5`}
      >
        <Markdown components={{ h1: 'h4', h2: 'h4', h3: 'h4' }}>{text}</Markdown>
      </div>
    );
  if (file.contentType === 'text/csv') {
    const rows = parseCsv(text, MAX_ROWS + 2);
    // One column means it was not comma-separated after all: show it as text.
    if (rows.length > 0 && rows[0].length > 1) return <CsvTable rows={rows} />;
  }
  return (
    <pre className={`${box} m-0 whitespace-pre p-3 font-mono text-xs leading-relaxed text-[var(--text-color)]`}>
      {file.contentType === 'application/json' ? prettyJson(text) : text}
    </pre>
  );
}

function CsvTable({ rows }: { rows: string[][] }) {
  const [head, ...rest] = rows;
  const body = rest.slice(0, MAX_ROWS);
  const width = Math.max(...rows.map((r) => r.length));
  const cells = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  return (
    <div>
      <div className="max-h-80 overflow-auto rounded-md border border-[var(--surface-border)]">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead className="sticky top-0 bg-[var(--surface-card)]">
            <tr>
              {cells(head).map((h, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap border-b border-[var(--surface-border)] px-2 py-1.5 text-left font-semibold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri} className="border-b border-[var(--surface-border)] last:border-0">
                {cells(r).map((v, i) => (
                  <td key={i} className="whitespace-nowrap px-2 py-1 text-[var(--text-color)]">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rest.length > MAX_ROWS && (
        <div className="mt-1 text-xs text-[var(--text-color-secondary)]">
          The first {MAX_ROWS} rows. Download the file for the rest.
        </div>
      )}
    </div>
  );
}

/** Enough of RFC 4180 for a glance: quoted fields, doubled quotes, and commas or line breaks inside quotes. */
function parseCsv(text: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
  }
  if (rows.length < maxRows && (field !== '' || row.length > 0)) endRow();
  return rows;
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

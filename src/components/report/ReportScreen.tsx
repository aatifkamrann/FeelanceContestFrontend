'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FilterMatchMode, FilterService } from 'primereact/api';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import {
  DataTable,
  type DataTableColReorderEvent,
  type DataTableFilterMeta,
  type DataTableFilterMetaData,
  type DataTablePageEvent,
  type DataTableRowToggleEvent,
  type DataTableSortMeta,
  type DataTableStateEvent,
} from 'primereact/datatable';
import { Dropdown } from 'primereact/dropdown';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { InputText } from 'primereact/inputtext';
import { MultiSelect } from 'primereact/multiselect';
import { Panel } from 'primereact/panel';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import HelpIcon from '@/components/HelpIcon';
import SiteHeader from '@/components/SiteHeader';
import { usePortalName } from '@/components/PortalNote';
import { formatAward, meQuery } from '@/lib/opportunities';
import type { ReportScope } from '@/lib/reports';

/*
 * A report screen: rows that are the signed-in account's to see, as one
 * table to sort, group, total and take away. Every report shares this —
 * the heading, the folding filters panel, the grouping and column
 * controls, the table, its footers and the four exports — so the
 * opportunities report and the applications report behave as one. A
 * report brings its rows, its columns, its groupings and the inputs of
 * its filters panel.
 *
 * The table is PrimeReact's, but the rows it shows are decided here: the
 * report's panel narrows the rows first, then the table's own global box
 * and column menus narrow them again and its headers sort them — and that
 * second pass is run here too (FilterService and a comparator over the
 * same sort meta), so the rows the footer totals, the group footers total
 * and the exports carry are exactly the rows on screen, whatever the table
 * is doing internally. Grouping rides on one synthetic field (`groupKey`),
 * which is always the first sort — that is the one thing PrimeReact's
 * subheader grouping asks of the data.
 */

// ------------------------------------------------------------- columns

export type Kind = 'text' | 'money' | 'int' | 'days' | 'date';

export type ReportColumn<R> = {
  key: keyof R & string;
  header: string;
  kind: Kind;
  /** What the footer says of the rows above it. The first column shown also counts them. */
  total?: 'sum' | 'avg';
  /** Shown until the reader chooses otherwise. */
  on?: boolean;
  /** The scopes it belongs on; every scope where unset. */
  only?: ReportScope[];
  width: string;
  /** A money column's currency field; `currency` where unset. */
  currency?: keyof R & string;
  /** False for a column whose words are a badge. Dates never filter from the menu. */
  filter?: boolean;
  /** Long words wrap rather than widen the column. */
  wrap?: boolean;
  /** The cell on screen where it is more than its words — a link, a badge. Exports and print read the words. */
  render?: (row: R, scope: ReportScope) => ReactNode;
};

export type ReportGroup<R> = {
  label: string;
  value: string;
  only?: ReportScope[];
  /** The group a row falls in: `key` sorts, `label` reads. Absent on "No grouping". */
  of?: (row: R) => { key: string; label: string };
};

export type ReportFilters<R> = {
  /** The panel's inputs, laid out after the search box. */
  node: ReactNode;
  /** How many of them are in force, for the badge on the heading. */
  active: number;
  clear: () => void;
  /** The rows the panel leaves. Keep it stable (useCallback) — the table recomputes when it changes. */
  narrow: (rows: R[]) => R[];
};

type Grouped<R> = R & { groupKey: string; group: string };

const numeric = (k: Kind) => k === 'money' || k === 'int' || k === 'days';

function filterable<R>(c: ReportColumn<R>): boolean {
  return c.filter !== false && c.kind !== 'date';
}

// ------------------------------------------------------------- helpers

export const msOf = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null);

export const fmtDate = (at: number | null | undefined): string =>
  at == null ? '—' : new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtInt = (n: number): string => n.toLocaleString();
export const fmtDays = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** A group whose key is its label. */
export const byLabel = (label: string) => ({ key: label, label });

/** The month an instant falls in: "2026-09" to sort by, "September 2026" to read. */
export function monthOf(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  return {
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  };
}

/** The distinct values, in order — what a panel's lists offer. */
export const uniqueSorted = (xs: string[]): string[] => [...new Set(xs)].sort((a, b) => a.localeCompare(b));

/**
 * A panel's list of people, keyed by account: each id once, under its name,
 * in name order. Two accounts that share a name stay two choices, and a link
 * can name one by id.
 */
export function peopleChoices<R>(
  rows: R[],
  id: (r: R) => string,
  name: (r: R) => string,
): { label: string; value: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) if (!seen.has(id(r))) seen.set(id(r), name(r));
  return [...seen].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
}

/** A day range from the calendar, as [from, to] in ms with the to-day running to its end; null when nothing is chosen. */
export function dayRange(range: (Date | null)[] | null): [number, number] | null {
  if (!range || !range[0]) return null;
  const from = new Date(range[0]);
  from.setHours(0, 0, 0, 0);
  const to = new Date(range[1] ?? range[0]);
  to.setHours(23, 59, 59, 999);
  return [from.getTime(), to.getTime()];
}

const counted = (n: number, noun: [string, string]) => `${fmtInt(n)} ${n === 1 ? noun[0] : noun[1]}`;

/** The words in a cell — what the exports and the print sheet carry. */
function cellText<R>(row: R, col: ReportColumn<R>): string {
  const v = row[col.key] as unknown;
  switch (col.kind) {
    case 'money':
      return typeof v === 'number' ? formatAward(v, String(row[(col.currency ?? 'currency') as keyof R])) : '—';
    case 'int':
      return typeof v === 'number' ? fmtInt(v) : '—';
    case 'days':
      return fmtDays(v as number | null | undefined);
    case 'date':
      return fmtDate(v as number | null | undefined);
    default:
      return v === null || v === undefined || v === '' ? '—' : String(v);
  }
}

/** The value in a cell for a spreadsheet: a number, a date, or the words. */
function cellValue<R>(row: R, col: ReportColumn<R>): number | Date | string | null {
  const v = row[col.key] as unknown;
  if (v === null || v === undefined) return null;
  if (col.kind === 'date') return new Date(v as number);
  if (numeric(col.kind)) return v as number;
  return String(v);
}

/** Amounts summed per currency: "$12,000 · EUR 3,000". */
function sumMoney<R>(rows: R[], col: ReportColumn<R>): string {
  const by = new Map<string, number>();
  for (const r of rows) {
    const n = r[col.key] as unknown;
    if (typeof n !== 'number') continue;
    const currency = String(r[(col.currency ?? 'currency') as keyof R]);
    by.set(currency, (by.get(currency) ?? 0) + n);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, n]) => formatAward(n, c))
    .join(' · ');
}

/** What a column's own total says of these rows; empty for a column that has none. */
function columnTotal<R>(col: ReportColumn<R>, rows: R[]): string {
  if (!col.total || rows.length === 0) return '';
  if (col.kind === 'money') return sumMoney(rows, col);
  const values = rows.map((r) => r[col.key] as unknown).filter((n): n is number => typeof n === 'number');
  if (values.length === 0) return '';
  const sum = values.reduce((a, b) => a + b, 0);
  if (col.total === 'sum') return fmtInt(sum);
  return `avg ${fmtDays(Math.round((sum / values.length) * 10) / 10)}`;
}

/** A footer cell: the first column shown counts the rows, whichever column that is, so hiding one never loses the count. */
function footText<R>(col: ReportColumn<R>, index: number, rows: R[], noun: [string, string]): string {
  const own = columnTotal(col, rows);
  if (index > 0 || rows.length === 0) return own;
  return own ? `${counted(rows.length, noun)} · ${own}` : counted(rows.length, noun);
}

// ------------------------------------------------------------- filters

/** The table's own filters — the global box and the column menus — applied here, the way the table applies them. */
function applyTableFilters<T>(rows: T[], filters: DataTableFilterMeta, searchFields: string[]): T[] {
  let out = rows;
  for (const [field, meta] of Object.entries(filters)) {
    const m = meta as DataTableFilterMetaData;
    if (m.value === null || m.value === undefined || m.value === '') continue;
    out = FilterService.filter(out, field === 'global' ? searchFields : [field], m.value, m.matchMode as string) as T[];
  }
  return out;
}

function compare(a: unknown, b: unknown, field: string, order: number): number {
  const x = (a as Record<string, unknown>)[field];
  const y = (b as Record<string, unknown>)[field];
  // Nothing sorts last whichever way the column goes.
  if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
  if (y === null || y === undefined) return -1;
  const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
  return c * order;
}

function sortRows<T>(rows: T[], meta: DataTableSortMeta[]): T[] {
  return [...rows].sort((a, b) => {
    for (const m of meta) {
      const c = compare(a, b, m.field, m.order ?? 1);
      if (c !== 0) return c;
    }
    return 0;
  });
}

const GROUP_SORT: DataTableSortMeta = { field: 'groupKey', order: 1 };

function initialFilters<R>(columns: ReportColumn<R>[]): DataTableFilterMeta {
  const f: DataTableFilterMeta = { global: { value: null, matchMode: FilterMatchMode.CONTAINS } };
  for (const c of columns) {
    if (!filterable(c)) continue;
    f[c.key] = { value: null, matchMode: numeric(c.kind) ? FilterMatchMode.EQUALS : FilterMatchMode.CONTAINS };
  }
  return f;
}

// --------------------------------------------------------------- sheet

/** The report as a flat sheet: what print, Excel and PDF each render in their own way. */
type SheetLine<T> =
  | { kind: 'group'; label: string; count: number }
  | { kind: 'row'; row: T }
  | { kind: 'total'; label: string; cells: string[] };

function buildSheet<R>(
  rows: Grouped<R>[],
  cols: ReportColumn<R>[],
  grouped: boolean,
  noun: [string, string],
): SheetLine<Grouped<R>>[] {
  const lines: SheetLine<Grouped<R>>[] = [];
  const totalsOf = (label: string, of: Grouped<R>[]): SheetLine<Grouped<R>> => ({
    kind: 'total',
    label,
    cells: cols.map((c, i) => footText(c, i, of, noun)),
  });
  if (grouped) {
    let i = 0;
    while (i < rows.length) {
      const key = rows[i].groupKey;
      let j = i;
      while (j < rows.length && rows[j].groupKey === key) j++;
      const slice = rows.slice(i, j);
      lines.push({ kind: 'group', label: rows[i].group, count: slice.length });
      for (const r of slice) lines.push({ kind: 'row', row: r });
      lines.push(totalsOf(`Total — ${rows[i].group}`, slice));
      i = j;
    }
  } else {
    for (const r of rows) lines.push({ kind: 'row', row: r });
  }
  if (rows.length > 0) lines.push(totalsOf(grouped ? 'Grand total' : 'Total', rows));
  return lines;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** "Oct 1, 2026, 11:06 PM", as this browser writes it. */
const timeLabel = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function csvOf<R>(rows: Grouped<R>[], cols: ReportColumn<R>[], grouped: boolean): string {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = [...(grouped ? ['Group'] : []), ...cols.map((c) => c.header)];
  const body = rows.map((r) => [...(grouped ? [r.group] : []), ...cols.map((c) => cellText(r, c))]);
  return [head, ...body].map((line) => line.map(quote).join(',')).join('\r\n');
}

async function excelOf<R>(
  lines: SheetLine<Grouped<R>>[],
  cols: ReportColumn<R>[],
  sheetName: string,
  title: string,
  subtitle: string,
  noun: [string, string],
  // Whose file this is, in the workbook's own properties: the portal as it
  // is named in Settings, not the stock name. A spreadsheet outlives the
  // tab it was exported from, and its author is part of it.
  creator: string,
): Promise<Blob> {
  const ExcelJS = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = creator;
  const sheet = book.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 3 }] });
  sheet.addRow([title]).font = { bold: true, size: 14 };
  sheet.addRow([subtitle]).font = { color: { argb: 'FF6B7280' } };
  const head = sheet.addRow(cols.map((c) => c.header));
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  for (const line of lines) {
    if (line.kind === 'group') {
      const r = sheet.addRow([`${line.label} — ${counted(line.count, noun)}`]);
      r.font = { bold: true };
      sheet.mergeCells(r.number, 1, r.number, cols.length);
    } else if (line.kind === 'row') {
      const r = sheet.addRow(cols.map((c) => cellValue(line.row, c)));
      cols.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        if (c.kind === 'date') cell.numFmt = 'd mmm yyyy';
        else if (c.kind === 'money') cell.numFmt = '#,##0';
        else if (c.kind === 'days') cell.numFmt = '0.0';
      });
    } else {
      const r = sheet.addRow(line.cells.map((c, i) => (i === 0 ? `${line.label}: ${c}` : c)));
      r.font = { bold: true };
      r.border = { top: { style: 'thin' } };
    }
  }
  cols.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.max(10, Math.round(parseFloat(c.width) * 2.4));
    if (numeric(c.kind)) sheet.getColumn(i + 1).alignment = { horizontal: 'right' };
  });
  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function pdfOf<R>(
  lines: SheetLine<Grouped<R>>[],
  cols: ReportColumn<R>[],
  title: string,
  subtitle: string,
  noun: [string, string],
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  // Wide reports go on the bigger sheet rather than in a smaller face.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: cols.length > 11 ? 'a3' : 'a4' });
  const body = lines.map((line) => {
    if (line.kind === 'group') {
      return [
        {
          content: `${line.label} — ${counted(line.count, noun)}`,
          colSpan: cols.length,
          styles: { fontStyle: 'bold' as const, fillColor: [229, 231, 235] as [number, number, number] },
        },
      ];
    }
    if (line.kind === 'row') return cols.map((c) => cellText(line.row, c));
    return line.cells.map((c, i) => ({
      content: i === 0 ? `${line.label}: ${c}` : c,
      styles: { fontStyle: 'bold' as const, lineWidth: { top: 0.75 } },
    }));
  });
  autoTable(doc, {
    head: [cols.map((c) => c.header)],
    body,
    startY: 54,
    styles: { fontSize: cols.length > 11 ? 7 : 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [55, 65, 81] },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, { halign: numeric(c.kind) ? 'right' : 'left' }])),
    didDrawPage: (data) => {
      doc.setFontSize(13);
      doc.text(title, data.settings.margin.left, 28);
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      doc.text(subtitle, data.settings.margin.left, 42);
      const page = `Page ${doc.getCurrentPageInfo().pageNumber}`;
      doc.text(page, doc.internal.pageSize.getWidth() - data.settings.margin.right, doc.internal.pageSize.getHeight() - 16, {
        align: 'right',
      });
      doc.setTextColor(0);
    },
  });
  return doc.output('blob');
}

// -------------------------------------------------------------- screen

export type ReportScreenProps<R extends { id: string }> = {
  /** The heading: "Opportunities". The title adds "report". */
  name: string;
  /** The report's path segment, the stem of its export files and the key its folded panel is remembered under. */
  file: string;
  helpTopic: string;
  /** What one row is, one and many: ['opportunity', 'opportunities']. */
  noun: [string, string];
  scope: ReportScope;
  intro: string;
  /** Whose rows, in the subtitle: "opportunities you posted". */
  whose: string;
  /** What the table says with no rows at all. */
  empty: string;
  rows: R[];
  loading: boolean;
  fetching: boolean;
  failed: boolean;
  refetch: () => void;
  columns: ReportColumn<R>[];
  /** The first is "No grouping", with no `of`. */
  groups: ReportGroup<R>[];
  searchFields: (keyof R & string)[];
  searchPlaceholder: string;
  defaultSort: DataTableSortMeta[];
  filters: ReportFilters<R>;
};

export default function ReportScreen<R extends { id: string }>(props: ReportScreenProps<R>) {
  const { name, file, helpTopic, noun, scope, intro, whose, empty, columns, groups, searchFields, filters: panel } = props;
  const router = useRouter();
  const toast = useRef<Toast>(null);
  const me = useQuery(meQuery);
  // For the exported workbook's author property — see excelOf.
  const portalName = usePortalName();
  const fits = (only?: ReportScope[]) => !only || only.includes(scope);
  const panelKey = `wp.report.${file}.filters`;

  // Folded is the default, so the server render matches most viewers.
  const [panelCollapsed, setPanelCollapsed] = useState(true);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>(() => initialFilters(columns));
  const [sortMeta, setSortMeta] = useState<DataTableSortMeta[]>(props.defaultSort);
  const [groupBy, setGroupBy] = useState<string>(groups[0].value);
  const [expanded, setExpanded] = useState<Grouped<R>[]>([]);
  const [order, setOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [shown, setShown] = useState<string[]>(() => columns.filter((c) => c.on).map((c) => c.key));
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [busy, setBusy] = useState<string | null>(null);

  // Whether the filters are folded is how this person lays out this
  // screen — remembered on the device, like the rail. Like the rail they
  // start folded (since 1 October 2026) and an unfold is what is kept, so
  // an older 'collapsed' reads as folded too. The header's count says when
  // filters are on, a link's included, with the panel shut.
  useEffect(() => {
    try {
      setPanelCollapsed(localStorage.getItem(panelKey) !== 'open');
    } catch {
      /* storage unavailable */
    }
  }, [panelKey]);
  // When the sheet was drawn, by the reader's own clock. The server renders
  // this screen too, in its own time zone, so a time written while
  // rendering never matches the browser's and React throws the server's
  // page away. It is set after mount instead, and again as the browser
  // prints, so the paper says when it was printed.
  const [printedAt, setPrintedAt] = useState<Date | null>(null);
  useEffect(() => {
    const now = () => setPrintedAt(new Date());
    now();
    window.addEventListener('beforeprint', now);
    return () => window.removeEventListener('beforeprint', now);
  }, []);

  const togglePanel = (collapsed: boolean) => {
    setPanelCollapsed(collapsed);
    try {
      if (collapsed) localStorage.removeItem(panelKey);
      else localStorage.setItem(panelKey, 'open');
    } catch {
      /* storage unavailable */
    }
  };

  const group = groups.find((g) => g.value === groupBy);
  const grouped = !!group?.of;
  const rows = useMemo<Grouped<R>[]>(
    () =>
      props.rows.map((r) => {
        const g = group?.of?.(r);
        return { ...r, groupKey: g?.key ?? '', group: g?.label ?? '' };
      }),
    [props.rows, group],
  );

  const effectiveSort = useMemo(
    () => (grouped ? [GROUP_SORT, ...sortMeta.filter((m) => m.field !== 'groupKey')] : sortMeta),
    [grouped, sortMeta],
  );
  const tableFilters = useMemo(
    () => ({ ...filters, global: { value: q || null, matchMode: FilterMatchMode.CONTAINS } }),
    [filters, q],
  );
  const narrow = panel.narrow;
  /** The rows on screen, in the order they are on screen. */
  const visible = useMemo(
    () => sortRows(applyTableFilters(narrow(rows) as Grouped<R>[], tableFilters, searchFields), effectiveSort),
    [rows, narrow, tableFilters, searchFields, effectiveSort],
  );
  const groupRows = useMemo(() => {
    const by = new Map<string, Grouped<R>[]>();
    for (const r of visible) {
      const list = by.get(r.groupKey);
      if (list) list.push(r);
      else by.set(r.groupKey, [r]);
    }
    return by;
  }, [visible]);

  const cols = useMemo(
    () => order.map((k) => columns.find((c) => c.key === k)!).filter((c) => fits(c.only) && shown.includes(c.key)),
    [order, shown, scope, columns], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Every group open the moment grouping is chosen; the toggles fold them.
  useEffect(() => {
    if (!grouped) return;
    const reps: Grouped<R>[] = [];
    for (const list of groupRows.values()) reps.push(list[0]);
    setExpanded(reps);
    // Only when the grouping changes — a filter must not reopen folded groups.
  }, [groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (me.data === null) router.replace(`/login?next=/reports/${file}`);
  }, [me.data, router, file]);
  useEffect(() => setFirst(0), [visible.length]);

  if (me.isLoading || me.data === null) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <i className="pi pi-spinner pi-spin text-3xl" />
      </main>
    );
  }

  if (me.isError || props.failed) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
            <p className="mt-3 font-medium">The report could not be loaded</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Nothing has changed — this screen only reads. Is the API up?
            </p>
            <Button label="Try again" icon="pi pi-refresh" className="mt-4" onClick={() => props.refetch()} />
          </div>
        </main>
      </>
    );
  }

  const title = `${name} report`;
  const tally = `${visible.length} of ${rows.length} ${whose} · ${grouped ? `grouped by ${group!.label.toLowerCase()} · ` : ''}`;
  // An export is made in the browser, at the moment it is asked for.
  const subtitle = () => `${tally}${timeLabel(new Date())}`;
  const activeCount = panel.active + (q ? 1 : 0);
  const narrowed = activeCount > 0 || Object.values(filters).some((m) => (m as DataTableFilterMetaData).value);

  const say = (what: string) => toast.current?.show({ severity: 'success', summary: what, life: 2500 });
  const fail = (what: string, e: unknown) =>
    toast.current?.show({ severity: 'error', summary: what, detail: e instanceof Error ? e.message : String(e), life: 5000 });

  const exportCsv = () => {
    download(new Blob([csvOf(visible, cols, grouped)], { type: 'text/csv;charset=utf-8' }), `${file}-${stamp()}.csv`);
    say(`${visible.length} rows to CSV`);
  };
  const exportExcel = async () => {
    setBusy('xlsx');
    try {
      download(
        await excelOf(buildSheet(visible, cols, grouped, noun), cols, name, title, subtitle(), noun, portalName),
        `${file}-${stamp()}.xlsx`,
      );
      say(`${visible.length} rows to Excel`);
    } catch (e) {
      fail('Excel export failed', e);
    } finally {
      setBusy(null);
    }
  };
  const exportPdf = async () => {
    setBusy('pdf');
    try {
      download(await pdfOf(buildSheet(visible, cols, grouped, noun), cols, title, subtitle(), noun), `${file}-${stamp()}.pdf`);
      say(`${visible.length} rows to PDF`);
    } catch (e) {
      fail('PDF export failed', e);
    } finally {
      setBusy(null);
    }
  };

  const onColReorder = (e: DataTableColReorderEvent) => {
    const moved = (e.columns as unknown as ReactElement<{ field?: string }>[]).map((c) => c.props.field).filter((f): f is string => !!f);
    setOrder((prev) => [...moved, ...prev.filter((k) => !moved.includes(k))]);
  };

  const body = (col: ReportColumn<R>) => (row: Grouped<R>): ReactNode =>
    col.render ? col.render(row, scope) : cellText(row, col);

  const sheet = buildSheet(visible, cols, grouped, noun);

  return (
    <>
      <Toast ref={toast} />
      <div className="print:hidden">
        <SiteHeader />
      </div>
      <main className="p-6 print:hidden">
        <div className="mx-auto max-w-[96rem]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                {name}
                <HelpIcon topic={helpTopic} />
              </h1>
              <p className="text-[var(--text-color-secondary)]">{intro}</p>
            </div>
            <Button
              label="Refresh"
              icon={`pi ${props.fetching ? 'pi-spin pi-spinner' : 'pi-refresh'}`}
              outlined
              onClick={() => props.refetch()}
              disabled={props.fetching}
            />
          </div>

          <Panel
            toggleable
            collapsed={panelCollapsed}
            onToggle={(e) => togglePanel(e.value)}
            // Named for what it does: the Panel would name it after the header, an element, read aloud as "[object Object]".
            pt={{ toggler: { 'aria-label': panelCollapsed ? 'Show the filters' : 'Hide the filters' } }}
            className="mt-6"
            header={
              <span className="flex items-center gap-2">
                <i className="pi pi-filter" aria-hidden />
                Filters
                {activeCount > 0 && <Tag value={String(activeCount)} severity="info" rounded />}
              </span>
            }
            icons={
              narrowed ? (
                <Button
                  label="Clear"
                  icon="pi pi-times"
                  text
                  size="small"
                  onClick={() => {
                    panel.clear();
                    setQ('');
                    setFilters(initialFilters(columns));
                  }}
                />
              ) : undefined
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <IconField iconPosition="left" className="md:col-span-2">
                <InputIcon className="pi pi-search" />
                <InputText
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={props.searchPlaceholder}
                  aria-label="Search the report"
                  className="w-full !pl-10"
                />
              </IconField>
              {panel.node}
            </div>
          </Panel>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Dropdown
              value={groupBy}
              options={groups.filter((g) => fits(g.only)).map((g) => ({ label: g.label, value: g.value }))}
              onChange={(e) => setGroupBy(e.value)}
              aria-label="Group by"
              className="min-w-[11rem]"
            />
            {grouped && (
              <>
                <Button
                  icon="pi pi-angle-double-down"
                  label="Expand all"
                  text
                  size="small"
                  onClick={() => setExpanded([...groupRows.values()].map((l) => l[0]))}
                />
                <Button icon="pi pi-angle-double-up" label="Collapse all" text size="small" onClick={() => setExpanded([])} />
              </>
            )}
            <MultiSelect
              value={shown.filter((k) => fits(columns.find((c) => c.key === k)!.only))}
              options={order
                .map((k) => columns.find((c) => c.key === k)!)
                .filter((c) => fits(c.only))
                .map((c) => ({ label: c.header, value: c.key }))}
              onChange={(e) => setShown(e.value)}
              placeholder="Columns"
              selectedItemsLabel="{0} columns"
              maxSelectedLabels={0}
              aria-label="Columns"
              className="min-w-[10rem]"
            />
            <span className="ml-auto flex flex-wrap items-center gap-1">
              <Button icon="pi pi-print" label="Print" outlined size="small" onClick={() => window.print()} disabled={visible.length === 0} />
              <Button icon="pi pi-file" label="CSV" outlined size="small" onClick={exportCsv} disabled={visible.length === 0} />
              <Button
                icon={`pi ${busy === 'xlsx' ? 'pi-spin pi-spinner' : 'pi-file-excel'}`}
                label="Excel"
                outlined
                size="small"
                onClick={() => void exportExcel()}
                disabled={visible.length === 0 || busy !== null}
              />
              <Button
                icon={`pi ${busy === 'pdf' ? 'pi-spin pi-spinner' : 'pi-file-pdf'}`}
                label="PDF"
                outlined
                size="small"
                onClick={() => void exportPdf()}
                disabled={visible.length === 0 || busy !== null}
              />
            </span>
          </div>

          <div className="mt-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)]">
            <DataTable
              value={visible}
              dataKey="id"
              loading={props.loading}
              size="small"
              stripedRows
              showGridlines
              scrollable
              tableStyle={{ minWidth: `${cols.reduce((w, c) => w + parseFloat(c.width), 0)}rem` }}
              resizableColumns
              columnResizeMode="expand"
              reorderableColumns
              onColReorder={onColReorder}
              sortMode="multiple"
              removableSort
              multiSortMeta={effectiveSort}
              onSort={(e: DataTableStateEvent) => setSortMeta((e.multiSortMeta ?? []).filter((m) => m.field !== 'groupKey'))}
              filters={tableFilters}
              onFilter={(e: DataTableStateEvent) => {
                const { global: _g, ...rest } = e.filters;
                void _g;
                setFilters(rest);
              }}
              filterDisplay="menu"
              globalFilterFields={searchFields}
              rowGroupMode={grouped ? 'subheader' : undefined}
              groupRowsBy={grouped ? 'groupKey' : undefined}
              expandableRowGroups={grouped}
              expandedRows={grouped ? expanded : undefined}
              onRowToggle={(e: DataTableRowToggleEvent) => setExpanded(e.data as Grouped<R>[])}
              rowGroupHeaderTemplate={(row: Grouped<R>) => (
                <span className="font-semibold">
                  {row.group}
                  <span className="ml-2 font-normal text-[var(--text-color-secondary)]">
                    {counted(groupRows.get(row.groupKey)?.length ?? 0, noun)}
                  </span>
                </span>
              )}
              rowGroupFooterTemplate={(row: Grouped<R>) => {
                const of = groupRows.get(row.groupKey) ?? [];
                return (
                  <>
                    {cols.map((c, i) => (
                      <td key={c.key} className={`font-semibold ${numeric(c.kind) ? 'text-right' : ''}`}>
                        {i === 0 ? `Total — ${row.group}: ${footText(c, i, of, noun)}` : footText(c, i, of, noun)}
                      </td>
                    ))}
                  </>
                );
              }}
              paginator
              first={first}
              rows={pageSize}
              rowsPerPageOptions={[10, 25, 50, 100, 500]}
              onPage={(e: DataTablePageEvent) => {
                setFirst(e.first);
                setPageSize(e.rows);
              }}
              paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
              currentPageReportTemplate="{first}–{last} of {totalRecords}"
              emptyMessage={rows.length === 0 ? empty : 'Nothing matches those filters.'}
            >
              {cols.map((c, i) => (
                <Column
                  key={c.key}
                  field={c.key}
                  header={c.header}
                  sortable
                  filter={filterable(c)}
                  dataType={numeric(c.kind) ? 'numeric' : 'text'}
                  showFilterOperator={false}
                  showAddButton={false}
                  filterPlaceholder={numeric(c.kind) ? 'A number' : 'Contains'}
                  body={body(c)}
                  footer={footText(c, i, visible, noun)}
                  align={numeric(c.kind) ? 'right' : 'left'}
                  alignHeader={numeric(c.kind) ? 'right' : 'left'}
                  style={{ width: c.width }}
                  className={c.wrap ? 'whitespace-normal' : undefined}
                />
              ))}
            </DataTable>
          </div>
        </div>
      </main>

      {/* What the printer gets: the same rows, groups and totals as one
          plain table, without the chrome around it. */}
      <section className="hidden p-6 print:block" aria-hidden>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-gray-600">
          {tally}
          {printedAt && timeLabel(printedAt)}
        </p>
        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={`border-b-2 border-gray-700 px-1 py-1 text-left ${numeric(c.kind) ? 'text-right' : ''}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.map((line, i) =>
              line.kind === 'group' ? (
                <tr key={i} className="bg-gray-200">
                  <td colSpan={cols.length} className="px-1 py-1 font-semibold">
                    {line.label} — {counted(line.count, noun)}
                  </td>
                </tr>
              ) : line.kind === 'row' ? (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c.key} className={`border-b border-gray-300 px-1 py-0.5 ${numeric(c.kind) ? 'text-right' : ''}`}>
                      {cellText(line.row, c)}
                    </td>
                  ))}
                </tr>
              ) : (
                <tr key={i} className="font-semibold">
                  {line.cells.map((cell, j) => (
                    <td key={j} className={`border-t border-gray-700 px-1 py-1 ${numeric(cols[j].kind) ? 'text-right' : ''}`}>
                      {j === 0 ? `${line.label}: ${cell}` : cell}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

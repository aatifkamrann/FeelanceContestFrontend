'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { InputSwitch } from 'primereact/inputswitch';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Sidebar } from 'primereact/sidebar';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import HelpIcon from '@/components/HelpIcon';
import SiteHeader from '@/components/SiteHeader';
import {
  adminCategoriesQuery,
  saveCategories,
  type AdminCategories,
  type AdminCategory,
  type AdminSubcategory,
  type CategoryLimits,
} from '@/lib/admin';
import { fetchMe } from '@/lib/opportunities';

/** A row as the screen edits it: new ones have no uses and a key still theirs to change. */
type Sub = AdminSubcategory & { isNew: boolean; keyTouched: boolean };
// uid is the screen's own handle: the key itself, until a new row's key is still being typed.
type Cat = Omit<AdminCategory, 'subcategories'> & { uid: string; isNew: boolean; keyTouched: boolean; subcategories: Sub[] };

const OTHER = 'other';

function editable(data: AdminCategories): Cat[] {
  return data.categories.map((c) => ({
    ...c,
    uid: c.key,
    isNew: false,
    keyTouched: true,
    subcategories: c.subcategories.map((s) => ({ ...s, isNew: false, keyTouched: true })),
  }));
}

/** A key suggested from a name: "Data labelling & QA" → "data-labelling-and-qa". */
function keyFrom(label: string, max: number): string {
  return label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

const KEY_SHAPE = /^[a-z0-9][a-z0-9-]*$/;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function usesText(c: Cat): string {
  const parts = [
    c.uses.opportunities > 0 && plural(c.uses.opportunities, 'opportunity', 'opportunities'),
    c.uses.profiles > 0 && plural(c.uses.profiles, 'profile', 'profiles'),
    c.uses.projects > 0 && plural(c.uses.projects, 'past project', 'past projects'),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Not used yet';
}

const inUse = (c: Cat) => c.uses.opportunities + c.uses.profiles + c.uses.projects > 0;

/** What would stop the save, in the words the API would use; checked as you type. */
function problemsOf(list: Cat[], limits: CategoryLimits): string[] {
  const out: string[] = [];
  const keys = new Set<string>();
  const labels = new Set<string>();
  if (list.length > limits.maxCategories) out.push(`At most ${limits.maxCategories} categories.`);
  for (const c of list) {
    const name = c.label.trim() || 'A category';
    if (!c.label.trim()) out.push('A category needs a name.');
    else if (!KEY_SHAPE.test(c.key) || c.key.length > limits.maxKey)
      out.push(`${name}: the key is lower-case letters, digits and hyphens.`);
    if (keys.has(c.key)) out.push(`Two categories share the key ${c.key}.`);
    if (labels.has(c.label.trim().toLowerCase())) out.push(`Two categories are both called ${c.label.trim()}.`);
    keys.add(c.key);
    labels.add(c.label.trim().toLowerCase());
    if (c.subcategories.length > limits.maxSubcategories)
      out.push(`${name}: at most ${limits.maxSubcategories} subcategories.`);
    const subKeys = new Set<string>();
    const subLabels = new Set<string>();
    for (const s of c.subcategories) {
      if (!s.label.trim()) out.push(`${name}: a subcategory needs a name.`);
      else if (!KEY_SHAPE.test(s.key) || s.key.length > limits.maxKey)
        out.push(`${name} › ${s.label.trim() || '…'}: the key is lower-case letters, digits and hyphens.`);
      if (subKeys.has(s.key)) out.push(`${name}: two subcategories share the key ${s.key}.`);
      if (subLabels.has(s.label.trim().toLowerCase())) out.push(`${name}: two subcategories are both called ${s.label.trim()}.`);
      subKeys.add(s.key);
      subLabels.add(s.label.trim().toLowerCase());
    }
  }
  return out;
}

/** Plain sentences for the confirmation: what this save adds, renames, hides and removes. */
function changesOf(saved: AdminCategory[], list: Cat[]): { lines: string[]; costsAi: boolean } {
  const lines: string[] = [];
  let costsAi = false;
  const before = new Map(saved.map((c) => [c.key, c]));
  const after = new Map(list.map((c) => [c.key, c]));
  for (const c of list) {
    const was = before.get(c.key);
    if (!was) {
      lines.push(`Add ${c.label.trim()}${c.subcategories.length ? ` with ${plural(c.subcategories.length, 'subcategory', 'subcategories')}` : ''}.`);
      costsAi = true;
      continue;
    }
    if (was.label !== c.label.trim()) lines.push(`Rename ${was.label} to ${c.label.trim()}.`);
    if (was.hidden !== c.hidden) lines.push(`${c.hidden ? 'Hide' : 'Offer again'} ${c.label.trim()}.`);
    if (was.label !== c.label.trim() || was.hidden !== c.hidden) costsAi = true;
    const subsBefore = new Map(was.subcategories.map((s) => [s.key, s]));
    for (const s of c.subcategories) {
      const sw = subsBefore.get(s.key);
      if (!sw) {
        lines.push(`Add ${c.label.trim()} › ${s.label.trim()}.`);
        costsAi = true;
      } else {
        if (sw.label !== s.label.trim()) lines.push(`Rename ${c.label.trim()} › ${sw.label} to ${s.label.trim()}.`);
        if (sw.hidden !== s.hidden) lines.push(`${s.hidden ? 'Hide' : 'Offer again'} ${c.label.trim()} › ${s.label.trim()}.`);
        if (sw.label !== s.label.trim() || sw.hidden !== s.hidden) costsAi = true;
      }
    }
    for (const sw of was.subcategories)
      if (!c.subcategories.some((s) => s.key === sw.key)) {
        lines.push(`Remove ${c.label.trim()} › ${sw.label}.`);
        costsAi = true;
      }
  }
  for (const was of saved)
    if (!after.has(was.key)) {
      lines.push(`Remove ${was.label}.`);
      costsAi = true;
    }
  const order = (xs: string[]) => xs.join('|');
  if (order(saved.map((c) => c.key).filter((k) => after.has(k))) !== order(list.map((c) => c.key).filter((k) => before.has(k)))) {
    lines.push('Change the order.');
    costsAi = true;
  }
  const skillsChanged = list.some((c) => {
    const was = before.get(c.key);
    if (!was) return false;
    if (order(was.skills) !== order(c.skills)) return true;
    return c.subcategories.some((s) => {
      const sw = was.subcategories.find((x) => x.key === s.key);
      return sw ? order(sw.skills) !== order(s.skills) : false;
    });
  });
  if (skillsChanged) lines.push('Change suggested skills.');
  return { lines, costsAi };
}

/**
 * Admin → Categories: the kinds of work opportunities are filed under and
 * members say they do. Edited here as a whole and saved at once, the way
 * the setups on Settings are. Administrators only, gated as Users is.
 */
export default function CategoriesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const saved = useQuery({ ...adminCategoriesQuery, enabled: me.data?.role === 'admin' });

  // The list as edited; null until read, and again after a save or a discard.
  const [draft, setDraft] = useState<Cat[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    if (saved.data && draft === null) setDraft(editable(saved.data));
  }, [saved.data, draft]);

  useEffect(() => {
    if (me.data === null) router.replace('/login?next=/admin/categories');
  }, [me.data, router]);

  const limits = saved.data?.limits;
  const problems = useMemo(() => (draft && limits ? problemsOf(draft, limits) : []), [draft, limits]);
  const changes = useMemo(
    () => (draft && saved.data ? changesOf(saved.data.categories, draft) : { lines: [], costsAi: false }),
    [draft, saved.data],
  );
  const dirty = changes.lines.length > 0;

  const save = useMutation({
    mutationFn: () =>
      saveCategories({
        version: saved.data!.version,
        categories: draft!.map((c) => ({
          key: c.key,
          label: c.label.trim(),
          hidden: c.hidden,
          skills: c.skills,
          subcategories: c.subcategories.map((s) => ({ key: s.key, label: s.label.trim(), hidden: s.hidden, skills: s.skills })),
        })),
      }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(adminCategoriesQuery.queryKey, fresh);
      setDraft(editable(fresh));
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['opportunity-categories'] });
      toast.current?.show({ severity: 'success', summary: 'Categories saved', detail: 'Every page offers the new list.', life: 6000 });
    },
    onError: (err: Error) =>
      toast.current?.show({ severity: 'error', summary: 'Not saved', detail: err.message, life: 10000 }),
  });

  const update = (uid: string, change: (c: Cat) => Cat) =>
    setDraft((prev) => prev && prev.map((c) => (c.uid === uid ? change(c) : c)));
  const newCount = useRef(0);

  // Up or down one place; Something else stays last, so nothing moves past it.
  const move = (index: number, by: -1 | 1) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const to = index + by;
      if (to < 0 || to >= prev.length || prev[index].builtin || prev[to].builtin) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const add = () => {
    if (!draft || !limits) return;
    newCount.current += 1;
    const fresh: Cat = {
      uid: `new:${newCount.current}`,
      key: '',
      label: '',
      hidden: false,
      skills: [],
      subcategories: [],
      uses: { opportunities: 0, profiles: 0, projects: 0 },
      builtin: false,
      updatedAtUtc: null,
      updatedBy: null,
      isNew: true,
      keyTouched: false,
    };
    // Before Something else, which stays last.
    const at = draft.findIndex((c) => c.builtin);
    setDraft(at < 0 ? [...draft, fresh] : [...draft.slice(0, at), fresh, ...draft.slice(at)]);
    setEditing(fresh.uid);
  };

  const askToSave = () =>
    confirmDialog({
      header: 'Save the categories?',
      icon: 'pi pi-tags',
      message: (
        <div className="max-w-md text-sm">
          <ul className="m-0 list-disc pl-5">
            {changes.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {changes.costsAi && (
            <p className="mt-3 text-[var(--text-color-secondary)]">
              The AI readings carry the list, so each freelancer&apos;s Recommended reading is asked again on their
              next visit — one call each, inside the usual caps.
            </p>
          )}
        </div>
      ),
      acceptLabel: 'Save changes',
      rejectLabel: 'Keep editing',
      defaultFocus: 'accept',
      accept: () => save.mutate(),
    });

  if (me.isLoading || me.data === null) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <i className="pi pi-spinner pi-spin text-3xl" />
      </main>
    );
  }
  if (me.data && me.data.role !== 'admin') {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">Categories are managed by portal administrators</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              You are signed in as a {me.data.role}. Your own work is on the dashboard.
            </p>
            <Link href="/dashboard" className="no-underline">
              <Button label="Dashboard" className="mt-4" />
            </Link>
          </div>
        </main>
      </>
    );
  }
  if (me.isError || saved.isError) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
            <p className="mt-3 font-medium">The categories could not be loaded</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Nothing has changed — this screen only reads them. Is the API up?
            </p>
            <Button label="Try again" className="mt-4" outlined onClick={() => void saved.refetch()} />
          </div>
        </main>
      </>
    );
  }

  const current = draft?.find((c) => c.uid === editing) ?? null;

  return (
    <>
      <SiteHeader />
      <main className="p-6">
        <Toast ref={toast} />
        <ConfirmDialog />
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">
                Categories
                <HelpIcon topic="admin.categories" label="Categories" />
              </h1>
              <p className="max-w-2xl text-[var(--text-color-secondary)]">
                The kinds of work opportunities are filed under and members say they do. Rename, reorder, hide or add
                one, then save. A kind something already uses can be hidden, not removed.
              </p>
            </div>
            <Button label="Add category" icon="pi pi-plus" onClick={add} disabled={!draft} />
          </div>

          {dirty && (
            <div className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--primary-color)] bg-[var(--surface-card)] p-3 shadow-sm">
              <span className="text-sm font-medium">
                {plural(changes.lines.length, 'change', 'changes')} not saved yet
              </span>
              <span className="flex-1" />
              <Button
                label="Discard"
                text
                disabled={save.isPending}
                onClick={() => {
                  setDraft(saved.data ? editable(saved.data) : null);
                  setEditing(null);
                }}
              />
              <Button
                label="Save changes"
                icon="pi pi-check"
                loading={save.isPending}
                disabled={problems.length > 0}
                onClick={askToSave}
              />
            </div>
          )}
          {problems.length > 0 && (
            <Message severity="warn" className="mt-3 w-full justify-start" text={problems[0]} />
          )}

          {!draft ? (
            <div className="p-10 text-center">
              <i className="pi pi-spinner pi-spin text-2xl" />
            </div>
          ) : (
            // One column the page's width: a grid item would otherwise grow to its longest line.
            <ol className="mt-4 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
              {draft.map((c, i) => (
                <li
                  key={c.uid}
                  className="flex items-center gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3"
                >
                  <div className="flex shrink-0 flex-col">
                    <Button
                      icon="pi pi-chevron-up"
                      text
                      size="small"
                      className="!h-6 !w-7 !p-0"
                      disabled={c.builtin || i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Move ${c.label || 'this category'} up`}
                    />
                    <Button
                      icon="pi pi-chevron-down"
                      text
                      size="small"
                      className="!h-6 !w-7 !p-0"
                      disabled={c.builtin || i + 1 >= draft.length || draft[i + 1].builtin}
                      onClick={() => move(i, 1)}
                      aria-label={`Move ${c.label || 'this category'} down`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(c.uid)}
                    className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-[var(--text-color)]"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium ${c.hidden ? 'text-[var(--text-color-secondary)]' : ''}`}>
                        {c.label.trim() || 'Unnamed category'}
                      </span>
                      <code className="text-xs text-[var(--text-color-secondary)]">{c.key}</code>
                      {c.hidden && <Tag value="Hidden" severity="secondary" />}
                      {c.isNew && <Tag value="New" severity="info" />}
                      {c.builtin && <Tag value="Always last" severity="secondary" />}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-[var(--text-color-secondary)]">
                      {usesText(c)}
                      {c.subcategories.length > 0 &&
                        ` · ${plural(c.subcategories.length, 'subcategory', 'subcategories')}: ${c.subcategories
                          .map((s) => s.label.trim() || '…')
                          .join(', ')}`}
                    </span>
                  </button>
                  <Button
                    icon="pi pi-pencil"
                    text
                    rounded
                    onClick={() => setEditing(c.uid)}
                    aria-label={`Edit ${c.label || 'this category'}`}
                  />
                </li>
              ))}
            </ol>
          )}
          {saved.data && (
            <p className="mt-3 text-xs text-[var(--text-color-secondary)]">
              {plural(saved.data.categories.length, 'category', 'categories')} saved. Changes reach every page within
              five minutes, and this one at once.
            </p>
          )}
        </div>

        <Sidebar
          visible={current !== null}
          position="right"
          onHide={() => setEditing(null)}
          header={<span className="text-lg font-semibold">{current?.isNew ? 'New category' : 'Category'}</span>}
          ariaCloseLabel="Close"
          className="!w-full md:!w-[40rem]"
        >
          {current && limits && (
            <CategoryEditor
              key={current.uid}
              category={current}
              limits={limits}
              onChange={(next) => update(current.uid, () => next)}
              onRemove={() => {
                setDraft((prev) => prev && prev.filter((c) => c.uid !== current.uid));
                setEditing(null);
              }}
            />
          )}
        </Sidebar>
      </main>
    </>
  );
}

function CategoryEditor({
  category: c,
  limits,
  onChange,
  onRemove,
}: {
  category: Cat;
  limits: CategoryLimits;
  onChange: (next: Cat) => void;
  onRemove: () => void;
}) {
  const setSub = (index: number, change: Partial<Sub>) =>
    onChange({ ...c, subcategories: c.subcategories.map((s, i) => (i === index ? { ...s, ...change } : s)) });
  const moveSub = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= c.subcategories.length) return;
    const next = [...c.subcategories];
    [next[index], next[to]] = [next[to], next[index]];
    onChange({ ...c, subcategories: next });
  };
  const addSub = () => {
    onChange({
      ...c,
      subcategories: [
        ...c.subcategories,
        { key: '', label: '', hidden: false, skills: [], opportunities: 0, isNew: true, keyTouched: false },
      ],
    });
  };

  const removeReason = c.builtin
    ? 'Something else always stays: a brief that fits nothing needs somewhere to go.'
    : inUse(c)
      ? `In use (${usesText(c)}) — hide it instead, so what uses it keeps it.`
      : null;

  return (
    <div className="grid gap-5">
      <NameAndKey
        idPrefix="cat"
        label={c.label}
        keyValue={c.key}
        isNew={c.isNew}
        keyTouched={c.keyTouched}
        limits={limits}
        onChange={(label, key, keyTouched) => onChange({ ...c, label, key, keyTouched })}
      />

      {!c.builtin && (
        <div className="flex items-start gap-3">
          <InputSwitch
            inputId="cat-hidden"
            checked={c.hidden}
            onChange={(e) => onChange({ ...c, hidden: !!e.value })}
          />
          <label htmlFor="cat-hidden" className="text-sm">
            <span className="font-medium">Hidden</span>
            <HelpIcon topic="admin.categories.hidden" label="Hidden" />
            <span className="block text-[var(--text-color-secondary)]">
              Nothing new can choose it; what already did keeps it. Its subcategories are hidden with it.
            </span>
          </label>
        </div>
      )}

      {!c.builtin && (
        <SkillChips
          id="cat-skills"
          skills={c.skills}
          limits={limits}
          onChange={(skills) => onChange({ ...c, skills })}
        />
      )}

      {!c.builtin && (
        <section>
          <h3 className="m-0 text-base font-semibold">Subcategories</h3>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            Narrower kinds a client may pick under this one; optional on an opportunity.
          </p>
          <ol className="mt-3 grid list-none grid-cols-[minmax(0,1fr)] gap-3 p-0">
            {c.subcategories.map((s, i) => (
              <li key={s.isNew ? `new:${i}` : s.key} className="rounded-lg border border-[var(--surface-border)] p-3">
                <div className="flex items-start gap-2">
                  <div className="flex shrink-0 flex-col pt-6">
                    <Button
                      icon="pi pi-chevron-up"
                      text
                      size="small"
                      className="!h-6 !w-7 !p-0"
                      disabled={i === 0}
                      onClick={() => moveSub(i, -1)}
                      aria-label={`Move ${s.label || 'this subcategory'} up`}
                    />
                    <Button
                      icon="pi pi-chevron-down"
                      text
                      size="small"
                      className="!h-6 !w-7 !p-0"
                      disabled={i + 1 >= c.subcategories.length}
                      onClick={() => moveSub(i, 1)}
                      aria-label={`Move ${s.label || 'this subcategory'} down`}
                    />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-3">
                    <NameAndKey
                      idPrefix={`sub-${i}`}
                      label={s.label}
                      keyValue={s.key}
                      isNew={s.isNew}
                      keyTouched={s.keyTouched}
                      limits={limits}
                      onChange={(label, key, keyTouched) => setSub(i, { label, key, keyTouched })}
                    />
                    <div className="flex items-center gap-2 text-sm">
                      <InputSwitch
                        inputId={`sub-${i}-hidden`}
                        checked={s.hidden}
                        onChange={(e) => setSub(i, { hidden: !!e.value })}
                      />
                      <label htmlFor={`sub-${i}-hidden`}>Hidden</label>
                      <span className="flex-1" />
                      <span className="text-[var(--text-color-secondary)]">
                        {s.opportunities > 0 ? plural(s.opportunities, 'opportunity', 'opportunities') : 'Not used yet'}
                      </span>
                      <Button
                        icon="pi pi-trash"
                        text
                        size="small"
                        severity="danger"
                        disabled={s.opportunities > 0}
                        tooltip={s.opportunities > 0 ? 'In use — hide it instead' : undefined}
                        tooltipOptions={{ showOnDisabled: true, position: 'left' }}
                        onClick={() => onChange({ ...c, subcategories: c.subcategories.filter((_, j) => j !== i) })}
                        aria-label={`Remove ${s.label || 'this subcategory'}`}
                      />
                    </div>
                    <SkillChips
                      id={`sub-${i}-skills`}
                      skills={s.skills}
                      limits={limits}
                      onChange={(skills) => setSub(i, { skills })}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <Button
            label="Add subcategory"
            icon="pi pi-plus"
            text
            size="small"
            className="mt-2"
            disabled={c.subcategories.length >= limits.maxSubcategories}
            onClick={addSub}
          />
        </section>
      )}

      <section className="border-t border-[var(--surface-border)] pt-4">
        <Button
          label="Remove category"
          icon="pi pi-trash"
          severity="danger"
          outlined
          disabled={removeReason !== null}
          onClick={onRemove}
        />
        <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
          {removeReason ?? 'Nothing uses it yet, so it can go. The removal happens when you save.'}
        </p>
      </section>
    </div>
  );
}

/** A name, and the key under it: suggested from the name while new, fixed once saved. */
function NameAndKey({
  idPrefix,
  label,
  keyValue,
  isNew,
  keyTouched,
  limits,
  onChange,
}: {
  idPrefix: string;
  label: string;
  keyValue: string;
  isNew: boolean;
  keyTouched: boolean;
  limits: CategoryLimits;
  onChange: (label: string, key: string, keyTouched: boolean) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
      <div>
        <label htmlFor={`${idPrefix}-label`} className="text-sm font-medium">
          Name
        </label>
        <InputText
          id={`${idPrefix}-label`}
          value={label}
          maxLength={limits.maxLabel}
          className="mt-1 w-full"
          placeholder="e.g. Data labelling"
          onChange={(e) => {
            const next = e.target.value;
            onChange(next, isNew && !keyTouched ? keyFrom(next, limits.maxKey) || keyValue : keyValue, keyTouched);
          }}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-key`} className="text-sm font-medium">
          Key
          <HelpIcon topic="admin.categories.key" label="Key" />
        </label>
        <InputText
          id={`${idPrefix}-key`}
          value={keyValue}
          maxLength={limits.maxKey}
          disabled={!isNew}
          className="mt-1 w-full font-mono text-sm"
          onChange={(e) => onChange(label, e.target.value.toLowerCase(), true)}
        />
      </div>
    </div>
  );
}

/** Skill names as removable chips, added with Enter or a comma. */
function SkillChips({
  id,
  skills,
  limits,
  onChange,
}: {
  id: string;
  skills: string[];
  limits: CategoryLimits;
  onChange: (skills: string[]) => void;
}) {
  const [text, setText] = useState('');
  const full = skills.length >= limits.maxSkills;
  const commit = () => {
    const names = text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return;
    const next = [...skills];
    for (const name of names)
      if (next.length < limits.maxSkills && !next.some((s) => s.toLowerCase() === name.toLowerCase()))
        next.push(name.slice(0, limits.maxSkillName));
    onChange(next);
    setText('');
  };
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        Suggested skills
        <HelpIcon topic="admin.categories.skills" label="Suggested skills" />
      </label>
      {skills.length > 0 && (
        <ul className="mt-2 flex list-none flex-wrap gap-1.5 p-0">
          {skills.map((s) => (
            <li key={s}>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--surface-border)] px-2.5 py-0.5 text-sm">
                {s}
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 text-[var(--text-color-secondary)] hover:text-[var(--primary-color)]"
                  onClick={() => onChange(skills.filter((x) => x !== s))}
                  aria-label={`Remove ${s}`}
                >
                  <i className="pi pi-times text-xs" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <InputText
        id={id}
        value={text}
        disabled={full}
        className="mt-2 w-full"
        placeholder={full ? `At most ${limits.maxSkills}` : 'Type a skill, then Enter'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

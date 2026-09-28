'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { Checkbox } from 'primereact/checkbox';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { MultiSelect } from 'primereact/multiselect';
import { RadioButton } from 'primereact/radiobutton';
import { Slider } from 'primereact/slider';
import { Toast } from 'primereact/toast';
import Fold from '@/components/Fold';
import HelpIcon from '@/components/HelpIcon';
import { STEPPER } from '@/lib/forms';
import SuggestInput from '@/components/SuggestInput';
import AvatarField from '@/components/profile/AvatarField';
import ChipPicker from '@/components/profile/ChipPicker';
import ProjectImages from '@/components/profile/ProjectImages';
import SummaryNote from '@/components/profile/SummaryNote';
import { usePortalName } from '@/components/PortalNote';
import { skillsForCategories } from '@/lib/categorise';
import { aiStatusQuery, categoriesQuery } from '@/lib/opportunities';
import {
  AVAILABILITIES,
  LANGUAGE_LEVELS,
  MAX_HOURS_PER_WEEK,
  PROJECT_DURATIONS,
  PROJECT_TYPES,
  SKILL_LEVELS,
  WORK_TYPES,
  draftFrom,
  duplicateIndexes,
  paymentIdentity,
  paymentMethodsQuery,
  saveProfile,
  suggestionsQuery,
  type MemberProfile,
  type PaymentDraft,
  type PaymentMethodDef,
  type ProfileDraft,
  type ProfileLanguage,
  type ProfileSkill,
  type ProjectDraft,
} from '@/lib/profile';
import {
  LANGUAGE_SEEDS,
  PLACE_SEEDS,
  ROLE_SEEDS,
  SKILL_SEEDS,
  WORKING_WINDOW_SEEDS,
  localTimeZone,
  timeZones,
} from '@/lib/suggestions';

const EMPTY_SKILL: ProfileSkill = { name: '', years: 0, level: 'intermediate' };
const EMPTY_LANGUAGE: ProfileLanguage = { name: '', level: 'professional' };
const EMPTY_PROJECT: ProjectDraft = {
  title: '',
  description: '',
  outcome: '',
  role: '',
  category: null,
  tech: '',
  url: '',
  repoUrl: '',
  year: null,
  month: null,
  // Unticked, because nobody has said yet — and what nobody has said is not
  // permission. The row below the box says what that means while it is off.
  mayShowPublicly: false,
  images: [],
};

/** The earliest and latest a completion date may be, matching ProfileRules. */
const FIRST_PROJECT_MONTH = new Date(1970, 0, 1);
const LAST_PROJECT_MONTH = new Date(new Date().getFullYear() + 1, 11, 31);

/** A row that is outlined because it repeats one above it. */
const REPEATED = 'border-red-500/60 bg-red-500/5';

/** The form's sections, which the guided setup shows one at a time. */
export type ProfileSection = 'about' | 'expertise' | 'projects' | 'availability' | 'payout';

/**
 * The guided setup's hold on the form: which section is on screen, and where
 * its buttons go. The section is null on the setup's last step, which is the
 * preview rather than this form; the form stays mounted, so nothing typed on
 * a skipped step is lost before a later step saves it.
 */
export type ProfileGuide = {
  section: ProfileSection | null;
  back?: () => void;
  next: () => void;
};

/**
 * Where a member writes their portfolio. Everything on this form is
 * self-reported and the page says so — the point is not to be believed on
 * its own, it is to give a client something to read before they read the
 * code, and to give the AI features something to work from.
 *
 * One save for the whole form: skills, languages, past work and payment
 * methods are lists the API replaces wholesale, so there is no half-saved
 * state to reason about. The API refuses a list that says the same thing
 * twice, so the form marks the repeat as it is typed rather than letting the
 * save be the first anyone hears of it.
 */
export default function ProfileEditor({
  profile,
  onSaved,
  guide,
}: {
  profile: MemberProfile;
  onSaved: (saved: MemberProfile) => void;
  /** Set by the guided setup; left out, every section shows and folds. */
  guide?: ProfileGuide;
}) {
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const [value, setValue] = useState<ProfileDraft>(draftFrom(profile));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The About box, so a drafted summary can hand the cursor over to it.
  const bioRef = useRef<HTMLTextAreaElement>(null);
  // Which AI offers this portal makes; the summary note renders on it.
  const { data: aiStatus } = useQuery(aiStatusQuery);

  // The one taxonomy: the kinds of work an opportunity is filed under are the
  // kinds a member says they do, which is the whole point of asking here.
  const portalName = usePortalName();
  const { data: taxonomy } = useQuery(categoriesQuery);
  const categories = useMemo(() => taxonomy?.categories ?? [], [taxonomy]);
  const maxSecondary = taxonomy?.maxSecondaryCategories ?? 3;
  // The same eleven an opportunity is filed under, offered per project as well as
  // for the member themselves.
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ label: c.label, value: c.key })),
    [categories],
  );
  // Primary first, so what they mainly do leads the names offered below.
  const chosenCategories = useMemo(
    () => [value.primaryCategory, ...value.secondaryCategories],
    [value.primaryCategory, value.secondaryCategories],
  );
  const chosenLabels = chosenCategories
    .map((key) => categories.find((c) => c.key === key)?.label)
    .filter((label): label is string => label !== undefined);
  const suggestedSkills = useMemo(
    () => skillsForCategories(categories, chosenCategories, value.skills.map((s) => s.name)),
    [categories, chosenCategories, value.skills],
  );
  const skillsFull = value.skills.length >= 30;

  // A suggested name lands in the first blank row if there is one, so
  // pressing "Add skill" and then a chip does not leave an empty row behind.
  const addSkill = (name: string) =>
    setValue((prev) => {
      const list = [...prev.skills];
      const blank = list.findIndex((s) => s.name.trim() === '');
      if (blank >= 0) list[blank] = { ...list[blank], name };
      else list.push({ ...EMPTY_SKILL, name });
      return { ...prev, skills: list };
    });

  // What others wrote, ahead of the starter lists, so the portal's own
  // spellings lead. Loaded once; the form is the same form without it.
  const { data: others } = useQuery(suggestionsQuery);
  const pools = useMemo(
    () => ({
      locations: [others?.locations ?? [], PLACE_SEEDS],
      timeZones: [others?.timeZones ?? [], timeZones()],
      languages: [others?.languages ?? [], LANGUAGE_SEEDS],
      skills: [others?.skills ?? [], SKILL_SEEDS],
      roles: [others?.roles ?? [], ROLE_SEEDS],
      workingWindows: [others?.workingWindows ?? [], WORKING_WINDOW_SEEDS],
    }),
    [others],
  );
  // Only a freelancer is ever owed an award, so only a freelancer is asked
  // where it should go. The catalogue is fetched on the same condition.
  const paid = profile.role === 'freelancer' && value.payments !== undefined;
  // What a freelancer is read for — the kinds of work, skills, past work,
  // availability — a client or an administrator is not, so their form asks
  // only who they are and where. What is stored stays in the draft and is
  // sent back as it was, so an account whose role changed loses nothing.
  const freelancer = profile.role === 'freelancer';
  const { data: catalogue } = useQuery({ ...paymentMethodsQuery, enabled: paid });
  const methods = catalogue?.methods ?? [];
  const maxPayments = catalogue?.max ?? 0;

  // This device's zone is the likeliest answer. Read after mount: the
  // server rendering this form is in a different one.
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  useEffect(() => setDeviceZone(localTimeZone()), []);

  const set = <K extends keyof ProfileDraft>(key: K, v: ProfileDraft[K]) =>
    setValue((prev) => ({ ...prev, [key]: v }));

  const setSkill = (i: number, patch: Partial<ProfileSkill>) =>
    setValue((prev) => ({
      ...prev,
      skills: prev.skills.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));

  const setLanguage = (i: number, patch: Partial<ProfileLanguage>) =>
    setValue((prev) => ({
      ...prev,
      languages: prev.languages.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    }));

  const setProject = (i: number, patch: Partial<ProjectDraft>) =>
    setValue((prev) => ({
      ...prev,
      projects: prev.projects.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    }));

  const setPayment = (i: number, patch: Partial<PaymentDraft>) =>
    setValue((prev) => ({
      ...prev,
      payments: (prev.payments ?? []).map((p, j) => (j === i ? { ...p, ...patch } : p)),
    }));

  const setPaymentDetail = (i: number, key: string, v: string) =>
    setValue((prev) => ({
      ...prev,
      payments: (prev.payments ?? []).map((p, j) =>
        j === i ? { ...p, details: { ...p.details, [key]: v } } : p,
      ),
    }));

  const payments = value.payments ?? [];

  // A repeat found on one step is not news on the next.
  const section = guide?.section;
  useEffect(() => setError(null), [section]);

  // The repeats, marked where they are rather than announced at the bottom.
  const repeated = useMemo(
    () => ({
      skills: duplicateIndexes(value.skills.map((s) => s.name)),
      languages: duplicateIndexes(value.languages.map((l) => l.name)),
      projects: duplicateIndexes(value.projects.map((p) => p.title)),
      payments: duplicateIndexes(
        (value.payments ?? []).map((p) => paymentIdentity(byKey(methods, p.method), p.details)),
      ),
    }),
    [value.skills, value.languages, value.projects, value.payments, methods],
  );

  /** The same sentence the API would answer with, said before the trip. */
  const repeatProblem = (): string | null => {
    const first = (list: Set<number>, of: string[]) =>
      list.size === 0 ? null : of[Math.min(...list)];
    const skill = first(repeated.skills, value.skills.map((s) => s.name));
    if (skill) return `“${skill.trim()}” is in your skills twice — one row each.`;
    const language = first(repeated.languages, value.languages.map((l) => l.name));
    if (language) return `“${language.trim()}” is in your languages twice — one row each.`;
    const project = first(repeated.projects, value.projects.map((p) => p.title));
    if (project) return `“${project.trim()}” is in your past work twice — give them different titles.`;
    if (repeated.payments.size > 0) return 'The same account is listed twice — one row each.';
    return null;
  };

  /** Whether the profile was saved, so a step moves on only when it was. */
  const save = async (): Promise<boolean> => {
    const repeat = repeatProblem();
    if (repeat) {
      setError(repeat);
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      // Blank rows are how a half-filled form looks, not something to save.
      // A payment row with nothing typed in it at all is the same case; one
      // with only some of its fields is a real mistake and the API says so.
      const cleaned: ProfileDraft = {
        ...value,
        skills: value.skills.filter((s) => s.name.trim() !== ''),
        languages: value.languages.filter((l) => l.name.trim() !== ''),
        projects: value.projects.filter((p) => p.title.trim() !== ''),
        // Sent only where the section was actually on screen. JSON.stringify
        // drops an undefined, so the API is asked to leave the stored list
        // alone rather than handed an empty one it would take literally.
        payments: paid
          ? value.payments
              ?.filter((p) => Object.values(p.details).some((v) => v.trim() !== ''))
              // The flag is the form's note to itself, not something to store.
              .map(({ method, label, details }) => ({ method, label, details }))
          : undefined,
      };
      const saved = await saveProfile(cleaned);
      setValue(draftFrom(saved));
      onSaved(saved);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      // The name is on the account, so the shell is reading a stale copy of
      // it the moment this save lands.
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.current?.show({ severity: 'success', summary: 'Profile saved', life: 2000 });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Toast ref={toast} />

      <Section
        of="about"
        guide={guide}
        id="profile-about"
        className="p-6"
        defaultOpen={false}
        title={freelancer ? 'Tell Us About Your Work' : 'Tell Us About You'}
        extra={<HelpIcon topic="profile.about" label="What to write here" />}
      >
        <div className="mt-4 flex flex-col gap-4">
          <AvatarField
            name={value.displayName}
            currentUrl={profile.avatarUrl}
            value={value.avatar}
            onChange={(change) => set('avatar', change)}
          />
          <div>
            <label htmlFor="p-name" className="font-medium">
              Display name
            </label>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              {freelancer
                ? 'What clients and other entrants see. Changing it changes it everywhere at once, including on opportunities you have already entered.'
                : 'What other members see. Changing it changes it everywhere at once, including on opportunities you have already posted.'}
            </p>
            <InputText
              id="p-name"
              value={value.displayName}
              onChange={(e) => set('displayName', e.target.value)}
              className="mt-1 w-full"
              maxLength={80}
            />
          </div>
          <div>
            <label htmlFor="p-headline" className="font-medium">
              Professional Title
            </label>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Under your name wherever you appear.
            </p>
            <InputText
              id="p-headline"
              value={value.headline}
              onChange={(e) => set('headline', e.target.value)}
              placeholder={freelancer ? 'e.g. Django specialist — reporting, invoicing, PDFs' : 'e.g. Head of product at Acme'}
              className="mt-1 w-full"
              maxLength={120}
            />
          </div>
          <div>
            <label htmlFor="p-bio" className="font-medium">
              About You
            </label>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              {freelancer
                ? 'What you build, who you build it for, and how you work.'
                : 'Who you are, what your business does, and what you post opportunities for.'}
            </p>
            <InputTextarea
              ref={bioRef}
              id="p-bio"
              value={value.bio}
              onChange={(e) => set('bio', e.target.value)}
              rows={6}
              maxLength={2000}
              className="mt-1 w-full"
            />
            {aiStatus?.features.summary && (
              <SummaryNote
                className="mt-3"
                draft={value}
                onUse={(text) => set('bio', text)}
                onEdit={(text) => {
                  set('bio', text);
                  // Once React has put the words in the box, not before:
                  // the cursor goes to the end of what was drafted.
                  setTimeout(() => {
                    const el = bioRef.current;
                    if (!el) return;
                    el.focus();
                    el.setSelectionRange(el.value.length, el.value.length);
                  }, 0);
                }}
              />
            )}
          </div>
        </div>
      </Section>

      {/* Step four of joining: what they do, what they are best at, when
          they are free to do it and in which languages. One card because it
          is one question asked four ways — and because the kinds of work
          chosen at the top are what the skill names further down are drawn
          from. */}
      <Section
        of="expertise"
        guide={guide}
        id="profile-expertise"
        className="p-6"
        defaultOpen={false}
        title={freelancer ? 'Expertise' : 'Where You Are'}
        extra={
          freelancer ? (
            <HelpIcon topic="profile.categories" label="Why the portal asks" />
          ) : (
            <HelpIcon topic="profile.whereYouWork" label="Why these matter" />
          )
        }
      >
        {freelancer && (
          <>
            <p className="mt-3 font-medium">What Do You Do?</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              This is where the network starts building its matching intelligence.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="p-category" label="Primary category">
                <Dropdown
                  inputId="p-category"
                  value={value.primaryCategory}
                  options={categories}
                  optionLabel="label"
                  optionValue="key"
                  placeholder="The work you mainly do"
                  showClear
                  className="w-full"
                  onChange={(e) =>
                    setValue((prev) => ({
                      ...prev,
                      primaryCategory: e.value ?? null,
                      // The primary is never also one of the others; the API
                      // drops the repeat, so the form must not show it kept.
                      secondaryCategories: prev.secondaryCategories.filter((k) => k !== e.value),
                    }))
                  }
                />
              </Field>
              <div>
                <label htmlFor="p-secondary-categories" className="font-medium">
                  Secondary categories
                </label>
                <div className="mt-1">
                  <MultiSelect
                    inputId="p-secondary-categories"
                    value={value.secondaryCategories}
                    options={categories.filter((c) => c.key !== value.primaryCategory)}
                    optionLabel="label"
                    optionValue="key"
                    display="chip"
                    showClear
                    selectionLimit={maxSecondary}
                    placeholder={`Add up to ${maxSecondary}`}
                    className="w-full"
                    onChange={(e) => set('secondaryCategories', e.value ?? [])}
                  />
                </div>
              </div>
            </div>

            <hr className="my-6 border-0 border-t border-[var(--surface-border)]" />

            <h3 className="font-semibold">
              What Are You Best At?
              <HelpIcon topic="profile.skills" label="Listing skills" />
            </h3>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              The ones you would be hired for. Six named well say more than twenty listed.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {value.skills.map((s, i) => (
                <div
                  key={i}
                  className={`flex flex-wrap items-start gap-2 rounded-lg border p-3 ${
                    repeated.skills.has(i) ? REPEATED : 'border-[var(--surface-border)]'
                  }`}
                >
                  <SuggestInput
                    value={s.name}
                    onChange={(v) => setSkill(i, { name: v })}
                    options={pools.skills}
                    placeholder="e.g. PostgreSQL"
                    className="min-w-[12rem] flex-1"
                    maxLength={60}
                    ariaLabel={`Skill ${i + 1} name`}
                  />
                  <Dropdown
                    value={s.level}
                    onChange={(e) => setSkill(i, { level: e.value })}
                    options={SKILL_LEVELS}
                    optionLabel="label"
                    optionValue="value"
                    className="min-w-[9rem]"
                    aria-label={`Skill ${i + 1} level`}
                    itemTemplate={(o: (typeof SKILL_LEVELS)[number]) => (
                      <div>
                        <div className="font-medium">{o.label}</div>
                        <div className="text-xs text-[var(--text-color-secondary)]">{o.hint}</div>
                      </div>
                    )}
                  />
                  <InputNumber
                    {...STEPPER}
                    value={s.years}
                    onValueChange={(e) => setSkill(i, { years: e.value ?? 0 })}
                    min={0}
                    max={60}
                    suffix=" yrs"
                    className="w-[11rem]"
                    inputClassName="w-full"
                    aria-label={`Skill ${i + 1} years`}
                  />
                  <Button
                    icon="pi pi-trash"
                    text
                    size="small"
                    severity="danger"
                    aria-label={`Remove skill ${i + 1}`}
                    onClick={() =>
                      set(
                        'skills',
                        value.skills.filter((_, j) => j !== i),
                      )
                    }
                  />
                  {repeated.skills.has(i) && <Repeat what="skill" />}
                </div>
              ))}
            </div>
            <Button
              label="Add skill"
              icon="pi pi-plus"
              text
              size="small"
              className="mt-2"
              disabled={skillsFull}
              onClick={() => set('skills', [...value.skills, { ...EMPTY_SKILL }])}
            />
            {/* Names, not a reading of anything: the kinds of work chosen above
                each carry this portal's spelling of what they are built with,
                so the same skill is one name across every profile. Nothing is
                added until one is pressed. */}
            {suggestedSkills.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-[var(--text-color-secondary)]">
                  <i className="pi pi-lightbulb mr-1 text-amber-500" aria-hidden />
                  Suggested for {chosenLabels.join(', ')}:
                </span>
                {suggestedSkills.map((name) => (
                  <button
                    type="button"
                    key={name}
                    onClick={() => addSkill(name)}
                    disabled={skillsFull}
                    className="rounded-full border border-[var(--surface-border)] px-2 py-0.5 text-xs hover:border-[var(--primary-color)] disabled:opacity-50"
                    title={`Add ${name}`}
                  >
                    + {name}
                  </button>
                ))}
              </div>
            )}

            <hr className="my-6 border-0 border-t border-[var(--surface-border)]" />

            <h3 className="font-semibold">
              Where you work
              <HelpIcon topic="profile.whereYouWork" label="Why these matter" />
            </h3>
          </>
        )}
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          {freelancer && 'The context everything else is read in. '}
          The portal never asks for a date of birth or an identity document — it has no use for
          them.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="p-location" label="Location">
            <SuggestInput
              inputId="p-location"
              value={value.location}
              onChange={(v) => set('location', v)}
              options={pools.locations}
              placeholder="e.g. Lahore, Pakistan"
              maxLength={80}
            />
          </Field>
          <Field id="p-tz" label="Time zone">
            <SuggestInput
              inputId="p-tz"
              value={value.timeZone}
              onChange={(v) => set('timeZone', v)}
              options={pools.timeZones}
              placeholder="e.g. Asia/Karachi"
              maxLength={64}
            />
            {deviceZone && value.timeZone !== deviceZone && (
              <button
                type="button"
                onClick={() => set('timeZone', deviceZone)}
                className="mt-1 text-xs text-[var(--primary-color)] hover:underline"
              >
                Use {deviceZone} — this device&apos;s zone
              </button>
            )}
          </Field>
          {freelancer && (
            <>
              <Field id="p-years" label="Years of experience">
                <InputNumber
                  {...STEPPER}
                  inputId="p-years"
                  value={value.yearsExperience}
                  onValueChange={(e) => set('yearsExperience', e.value ?? null)}
                  min={0}
                  max={60}
                  className="w-full"
                  inputClassName="w-full"
                  placeholder="e.g. 6"
                />
              </Field>
            </>
          )}
          <Field id="p-site" label="Website">
            <InputText
              id="p-site"
              value={value.websiteUrl}
              onChange={(e) => set('websiteUrl', e.target.value)}
              placeholder="e.g. yourname.dev"
              className="w-full"
              maxLength={400}
            />
          </Field>
          <Field id="p-linkedin" label="LinkedIn">
            <InputText
              id="p-linkedin"
              value={value.linkedInUrl}
              onChange={(e) => set('linkedInUrl', e.target.value)}
              placeholder="e.g. linkedin.com/in/yourname"
              className="w-full"
              maxLength={400}
            />
          </Field>
        </div>

        {freelancer && (
          <>
            <div className="mt-4">
              <label htmlFor="p-worktype" className="font-medium">
                Primary work type
                <HelpIcon topic="profile.workType" label="Why this is asked" />
              </label>
              <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                What your weekly capacity is part of. None of the four is worth more than the others.
              </p>
              <Dropdown
                inputId="p-worktype"
                value={value.workType}
                options={WORK_TYPES}
                optionLabel="label"
                optionValue="value"
                placeholder="How you work"
                showClear
                className="mt-1 w-full sm:w-[22rem]"
                onChange={(e) => set('workType', e.value ?? null)}
                itemTemplate={(o: (typeof WORK_TYPES)[number]) => (
                  <div>
                    <div className="font-medium">{o.label}</div>
                    <div className="text-xs text-[var(--text-color-secondary)]">{o.hint}</div>
                  </div>
                )}
              />
            </div>
          </>
        )}

        <hr className="my-6 border-0 border-t border-[var(--surface-border)]" />

        <h3 className="font-semibold">
          Languages you work in
          <HelpIcon topic="profile.languages" label="Claiming a language" />
        </h3>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          One row each, with how well — a client deciding which language a call happens in is
          reading this, and a bare list does not answer them.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {value.languages.map((l, i) => (
            <div
              key={i}
              className={`flex flex-wrap items-start gap-2 rounded-lg border p-3 ${
                repeated.languages.has(i) ? REPEATED : 'border-[var(--surface-border)]'
              }`}
            >
              <SuggestInput
                value={l.name}
                onChange={(v) => setLanguage(i, { name: v })}
                options={pools.languages}
                placeholder="e.g. English"
                className="min-w-[12rem] flex-1"
                maxLength={60}
                ariaLabel={`Language ${i + 1}`}
              />
              <Dropdown
                value={l.level}
                onChange={(e) => setLanguage(i, { level: e.value })}
                options={LANGUAGE_LEVELS}
                optionLabel="label"
                optionValue="value"
                className="min-w-[12rem]"
                aria-label={`Language ${i + 1} level`}
                itemTemplate={(o: (typeof LANGUAGE_LEVELS)[number]) => (
                  <div>
                    <div className="font-medium">{o.label}</div>
                    <div className="text-xs text-[var(--text-color-secondary)]">{o.hint}</div>
                  </div>
                )}
              />
              <Button
                icon="pi pi-trash"
                text
                size="small"
                severity="danger"
                aria-label={`Remove language ${i + 1}`}
                onClick={() =>
                  set(
                    'languages',
                    value.languages.filter((_, j) => j !== i),
                  )
                }
              />
              {repeated.languages.has(i) && <Repeat what="language" />}
            </div>
          ))}
        </div>
        <Button
          label="Add a language"
          icon="pi pi-plus"
          text
          size="small"
          className="mt-2"
          disabled={value.languages.length >= 20}
          onClick={() => set('languages', [...value.languages, { ...EMPTY_LANGUAGE }])}
        />
      </Section>

      <Section
        of="projects"
        hidden={!freelancer}
        guide={guide}
        id="profile-projects"
        className="p-6"
        defaultOpen={false}
        title="Show What You’ve Built."
        extra={<HelpIcon topic="profile.projects" label="Adding past work" />}
      >
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          Your past work helps {portalName} understand where you have the strongest competitive
          advantage.
        </p>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          Shown as self-reported, because the portal cannot check it. A link or a repository
          anyone can open is worth more than a paragraph nobody can.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          {value.projects.map((p, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${
                repeated.projects.has(i) ? REPEATED : 'border-[var(--surface-border)]'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <InputText
                    value={p.title}
                    onChange={(e) => setProject(i, { title: e.target.value })}
                    placeholder="Project Name"
                    maxLength={140}
                    aria-label={`Project ${i + 1} name`}
                  />
                  <SuggestInput
                    value={p.role ?? ''}
                    onChange={(v) => setProject(i, { role: v })}
                    options={pools.roles}
                    placeholder="Your role — e.g. sole developer"
                    maxLength={80}
                    ariaLabel={`Project ${i + 1} role`}
                  />
                  {/* The same taxonomy as the kinds of work above, so a
                      project and a brief are filed in one vocabulary. */}
                  <Dropdown
                    value={p.category}
                    onChange={(e) => setProject(i, { category: e.value ?? null })}
                    options={categoryOptions}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Category"
                    showClear
                    className="w-full"
                    aria-label={`Project ${i + 1} category`}
                  />
                  {/* Month and year, typed or picked. A date in a month
                      that has not happened is not a completion. The label is
                      an element rather than an attribute: a Calendar puts
                      aria-label on its wrapper, and the field a screen reader
                      lands on is the input inside it. */}
                  <div>
                    <label htmlFor={`completed-${i}`} className="sr-only">
                      {`Project ${i + 1} completion date`}
                    </label>
                    <Calendar
                      inputId={`completed-${i}`}
                      value={p.year === null || p.month === null ? null : new Date(p.year, p.month - 1, 1)}
                      onChange={(e) => {
                        const picked = e.value as Date | null;
                        setProject(
                          i,
                          picked
                            ? { year: picked.getFullYear(), month: picked.getMonth() + 1 }
                            : { year: null, month: null },
                        );
                      }}
                      view="month"
                      dateFormat="mm/yy"
                      minDate={FIRST_PROJECT_MONTH}
                      maxDate={LAST_PROJECT_MONTH}
                      placeholder="Completion date — MM/YYYY"
                      className="w-full"
                      inputClassName="w-full"
                    />
                  </div>
                </div>
                <Button
                  icon="pi pi-trash"
                  text
                  size="small"
                  severity="danger"
                  aria-label={`Remove project ${i + 1}`}
                  onClick={() =>
                    set(
                      'projects',
                      value.projects.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
              {repeated.projects.has(i) && <Repeat what="title" />}
              {/* Work written down before the month was asked for keeps its
                  year: the field is empty rather than guessing January, and
                  the year stays until a real date replaces it. */}
              {p.year !== null && p.month === null && (
                <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
                  Completed {p.year} — pick a month to make it a date.
                </p>
              )}
              <InputTextarea
                value={p.description ?? ''}
                onChange={(e) => setProject(i, { description: e.target.value })}
                rows={2}
                maxLength={1000}
                placeholder="What you built and what it had to do"
                className="mt-2 w-full"
                aria-label={`Project ${i + 1} description`}
              />
              <InputTextarea
                value={p.outcome ?? ''}
                onChange={(e) => setProject(i, { outcome: e.target.value })}
                rows={2}
                maxLength={500}
                placeholder="Outcome — the result or benefit, e.g. month-end close cut from three days to one"
                className="mt-2 w-full"
                aria-label={`Project ${i + 1} outcome`}
              />
              <div className="mt-2">
                <SuggestInput
                  value={p.tech ?? ''}
                  onChange={(v) => setProject(i, { tech: v })}
                  options={pools.skills}
                  list
                  placeholder="Built with — e.g. Django, Postgres"
                  maxLength={200}
                  ariaLabel={`Project ${i + 1} tech`}
                />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <InputText
                  value={p.url ?? ''}
                  onChange={(e) => setProject(i, { url: e.target.value })}
                  placeholder="Project URL — a link anyone can open"
                  maxLength={400}
                  aria-label={`Project ${i + 1} URL`}
                />
                <InputText
                  value={p.repoUrl ?? ''}
                  onChange={(e) => setProject(i, { repoUrl: e.target.value })}
                  placeholder="Repository, if it is public"
                  maxLength={400}
                  aria-label={`Project ${i + 1} repository`}
                />
              </div>
              <ProjectImages
                value={p.images}
                onChange={(images) => setProject(i, { images })}
                what={p.title.trim() === '' ? `project ${i + 1}` : p.title.trim()}
              />
              {/* The portal is the one publishing this, so it does not
                  publish it on an assumption. Unticked is not a deletion:
                  the row stays, and stays the member's own. */}
              <div className="mt-3 flex items-start gap-2">
                <Checkbox
                  inputId={`may-show-${i}`}
                  checked={p.mayShowPublicly}
                  onChange={(e) => setProject(i, { mayShowPublicly: e.checked ?? false })}
                />
                <label htmlFor={`may-show-${i}`} className="text-sm">
                  I have permission to display this work publicly.
                  {!p.mayShowPublicly && (
                    <span className="block text-xs text-[var(--text-color-secondary)]">
                      Until you tick this, it stays on your page and nobody else sees it.
                    </span>
                  )}
                </label>
              </div>
            </div>
          ))}
        </div>
        <Button
          label="Add a Portfolio Project"
          icon="pi pi-plus"
          text
          size="small"
          className="mt-2"
          disabled={value.projects.length >= 20}
          onClick={() => set('projects', [...value.projects, { ...EMPTY_PROJECT }])}
        />
      </Section>

      {/* Step six of joining: when they can work. The hours a week moved
          here from the expertise card — they are the capacity, and the
          capacity is what the status, the lengths and the terms are about.
          All of it is a statement, not a filter: no opportunity checks any of
          it, and the merit score reads only the hours. */}
      <Section
        of="availability"
        hidden={!freelancer}
        guide={guide}
        id="profile-availability"
        className="p-6"
        defaultOpen={false}
        title="Availability"
        extra={<HelpIcon topic="profile.availability" label="What this is read for" />}
      >
        <p className="mt-3 font-medium">When Can You Work?</p>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          {portalName} matching depends on whether you can actually take on a project.
        </p>

        {/* A status rather than a fact: nothing is chosen until they choose,
            because "available now" is the one answer a client acts on. */}
        <fieldset className="mt-4">
          <legend className="font-medium">Current Availability</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {AVAILABILITIES.map((o) => (
              <div key={o.value} className="flex items-start gap-2">
                <RadioButton
                  inputId={`p-availability-${o.value}`}
                  name="availability"
                  value={o.value}
                  checked={value.availability === o.value}
                  onChange={(e) => set('availability', e.value)}
                />
                <label htmlFor={`p-availability-${o.value}`} className="text-sm">
                  {o.label}
                  <span className="block text-xs text-[var(--text-color-secondary)]">{o.hint}</span>
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        {/* The one number the merit score reads from this card. The slider
            is the mouse's way in and the stepper under it the keyboard's —
            the same number either way, and whole hours: the slider's own
            keyboard moves by a fraction of the range, so what it hands back
            is rounded before it is kept. Nought is nothing said rather than
            a promise of nothing; "no hours" is what the status above is for. */}
        <div className="mt-5">
          <label htmlFor="p-hours" id="p-hours-label" className="font-medium">
            Weekly Capacity
          </label>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            The most hours a week you can give a project.
          </p>
          <Slider
            value={value.hoursPerWeek ?? 0}
            onChange={(e) => {
              const raw = Array.isArray(e.value) ? e.value[0] : e.value;
              const hours = Math.round(raw);
              set('hoursPerWeek', hours > 0 ? hours : null);
            }}
            min={0}
            max={MAX_HOURS_PER_WEEK}
            step={1}
            // The name belongs on the handle, which is the element with the
            // slider role; the component's own ariaLabelledBy lands as a
            // misspelt attribute on the wrapper instead.
            pt={{ handle: { 'aria-labelledby': 'p-hours-label' } }}
            className="mt-4 w-full sm:w-[22rem]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <InputNumber
              {...STEPPER}
              inputId="p-hours"
              value={value.hoursPerWeek}
              onValueChange={(e) => set('hoursPerWeek', e.value ? e.value : null)}
              min={0}
              max={MAX_HOURS_PER_WEEK}
              className="w-[9rem]"
              inputClassName="w-full text-center font-semibold tabular-nums"
              placeholder="—"
            />
            <span>hours / week</span>
            {value.hoursPerWeek === null && (
              <span className="text-[var(--text-color-secondary)]">— not set yet</span>
            )}
          </div>
        </div>

        <div className="mt-5">
          <ChipPicker
            label="Preferred Project Duration"
            hint="Pick any that suit you. A preference, not a filter — no opportunity checks it."
            options={PROJECT_DURATIONS}
            value={value.preferredDurations}
            onChange={(next) => set('preferredDurations', next)}
          />
        </div>

        <div className="mt-5">
          <ChipPicker
            label="Preferred Project Types"
            hint="Every opportunity here is a competitive fixed price today; the other two say who to ask when the portal can offer them."
            options={PROJECT_TYPES}
            value={value.preferredProjectTypes}
            onChange={(next) => set('preferredProjectTypes', next)}
          />
        </div>

        {/* Free text with the usual answers offered: "evenings" is as real
            a window as a pair of times, and the time zone above is what
            makes either mean something to a client elsewhere. */}
        <div className="mt-5">
          <label htmlFor="p-window" className="font-medium">
            Preferred Working Window
            <span className="ml-1 font-normal text-[var(--text-color-secondary)]">(optional)</span>
          </label>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            The hours of the day you are usually at work
            {value.timeZone.trim() !== '' ? `, in ${value.timeZone.trim()}` : ', in your own time zone'}.
          </p>
          <SuggestInput
            inputId="p-window"
            value={value.workingWindow}
            onChange={(v) => set('workingWindow', v)}
            options={pools.workingWindows}
            placeholder="e.g. 09:00 – 18:00"
            className="mt-1 w-full sm:w-[22rem]"
            maxLength={40}
          />
        </div>
      </Section>

      {/* Step seven, and the last of them for a freelancer: where an award
          goes. Who may read it used to be the first thing this card said;
          it is now the last, in the box at the foot, because the promise
          reads better after the boxes it is a promise about than before
          anybody has typed a digit. */}
      {paid && (
        <Section
          of="payout"
          guide={guide}
          id="profile-payout"
          className="p-6"
          defaultOpen={false}
          title="Payout Setup"
          extra={<HelpIcon topic="profile.payment" label="Who can see this" />}
        >
          <p className="mt-3 font-medium">Get Paid When You Earn</p>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            Connect your payout method so your earnings can be processed when you complete
            eligible work.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {payments.map((p, i) => (
              <PaymentRow
                key={i}
                index={i}
                row={p}
                methods={methods}
                repeated={repeated.payments.has(i)}
                onChange={(patch) => setPayment(i, patch)}
                onDetail={(key, v) => setPaymentDetail(i, key, v)}
                onRemove={() =>
                  set(
                    'payments',
                    payments.filter((_, j) => j !== i),
                  )
                }
              />
            ))}
          </div>
          <Button
            label="Add a way to be paid"
            icon="pi pi-plus"
            text
            size="small"
            className="mt-2"
            disabled={methods.length === 0 || payments.length >= maxPayments}
            onClick={() =>
              set('payments', [...payments, { method: methods[0].key, label: '', details: {} }])
            }
          />
          {/* The lock, and then the reason to type anything under it. Who
              does read the details is not on the card any more; it is one
              click away, behind "Who can see this" on the heading, which is
              the same answer in full — administrators and the clients who
              award you, never another client or freelancer. */}
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-hover)] p-3 text-sm">
            <span className="text-lg leading-none" aria-hidden>
              🔒
            </span>
            <div>
              <p>
                <strong>Your financial details are private.</strong> Your public profile never
                shows bank accounts, wallet numbers, tax details or payment credentials.
              </p>
              <p className="mt-1 text-[var(--text-color-secondary)]">
                Add the details a client needs to pay you when you win.
              </p>
            </div>
          </div>
        </Section>
      )}

      {error && <Message severity="error" text={error} className="w-full" />}

      {!guide ? (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-[var(--surface-border)] bg-[var(--surface-ground)] py-3">
          <Button label="Save profile" icon="pi pi-save" loading={busy} onClick={() => void save()} />
          <p className="text-sm text-[var(--text-color-secondary)]">
            {freelancer
              ? 'Visible to other members. Your email address and your payment details never are.'
              : 'Visible to other members. Your email address never is.'}
          </p>
        </div>
      ) : (
        section && (
          // The whole form is saved, as it always is; a step moves on only
          // once the save has landed, and skipping saves nothing.
          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-[var(--surface-border)] bg-[var(--surface-ground)] py-3">
            {guide.back && (
              <Button label="Back" icon="pi pi-arrow-left" outlined onClick={guide.back} />
            )}
            <Button
              label="Save & continue"
              icon="pi pi-arrow-right"
              iconPos="right"
              loading={busy}
              onClick={async () => {
                if (await save()) guide.next();
              }}
            />
            <Button label="Skip for now" text onClick={guide.next} />
            <p className="text-sm text-[var(--text-color-secondary)]">
              A skipped step stays on the list until it is done.
            </p>
          </div>
        )
      )}
    </div>
  );
}

/**
 * One of the form's cards. Without the guided setup, a Fold like any other;
 * under it, the one section on screen, open with nothing to fold, and
 * nothing at all for the rest.
 */
function Section({
  of,
  guide,
  hidden,
  ...fold
}: { of: ProfileSection; guide?: ProfileGuide; hidden?: boolean } & React.ComponentProps<typeof Fold>) {
  if (hidden || (guide && guide.section !== of)) return null;
  return <Fold {...fold} foldable={!guide} />;
}

/**
 * One way of being paid. The method decides which boxes exist — picking
 * "Bank transfer" asks for an account title and a number, picking "Crypto"
 * asks for a network as well as an address, because an address on the wrong
 * chain is money gone.
 */
function PaymentRow({
  index,
  row,
  methods,
  repeated,
  onChange,
  onDetail,
  onRemove,
}: {
  index: number;
  row: PaymentDraft;
  methods: PaymentMethodDef[];
  repeated: boolean;
  onChange: (patch: Partial<PaymentDraft>) => void;
  onDetail: (key: string, value: string) => void;
  onRemove: () => void;
}) {
  const method = byKey(methods, row.method);
  const blank = method !== undefined && method.fields.every((f) => !row.details[f.key]?.trim());

  return (
    <div
      className={`rounded-lg border p-3 ${repeated ? REPEATED : 'border-[var(--surface-border)]'}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <Dropdown
          value={row.method}
          onChange={(e) => onChange({ method: e.value })}
          options={methods}
          optionLabel="label"
          optionValue="key"
          className="min-w-[14rem]"
          aria-label={`Payment method ${index + 1}`}
        />
        <InputText
          value={row.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Name this one (optional) — e.g. Preferred"
          className="min-w-[12rem] flex-1"
          maxLength={60}
          aria-label={`Payment method ${index + 1} name`}
        />
        <Button
          icon="pi pi-trash"
          text
          size="small"
          severity="danger"
          aria-label={`Remove payment method ${index + 1}`}
          onClick={onRemove}
        />
      </div>
      {method && (
        <>
          <p className="mt-2 text-xs text-[var(--text-color-secondary)]">{method.hint}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {method.fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`pay-${index}-${f.key}`} className="text-sm font-medium">
                  {f.label}
                  {!f.required && (
                    <span className="ml-1 font-normal text-[var(--text-color-secondary)]">
                      (optional)
                    </span>
                  )}
                </label>
                <InputText
                  id={`pay-${index}-${f.key}`}
                  value={row.details[f.key] ?? ''}
                  onChange={(e) => onDetail(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  className="mt-1 w-full"
                />
              </div>
            ))}
          </div>
        </>
      )}
      {repeated && <Repeat what="account" />}
      {blank && !repeated && (
        <p
          className={`mt-2 text-sm ${
            row.unreadable ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-color-secondary)]'
          }`}
          role={row.unreadable ? 'alert' : undefined}
        >
          {row.unreadable
            ? 'These details could not be read back and have to be typed again — the portal’s encryption keys changed since you saved them.'
            : 'Nothing typed here yet — a row with no details is dropped when you save.'}
        </p>
      )}
    </div>
  );
}

/** The note under a row that repeats one above it. */
function Repeat({ what }: { what: string }) {
  return (
    <p className="mt-2 w-full text-sm text-red-600 dark:text-red-400" role="alert">
      <i className="pi pi-exclamation-circle mr-1" aria-hidden />
      Already listed above. Remove this row or change the {what} — the portal will not save the
      same {what} twice.
    </p>
  );
}

function byKey(methods: PaymentMethodDef[], key: string): PaymentMethodDef | undefined {
  return methods.find((m) => m.key === key);
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

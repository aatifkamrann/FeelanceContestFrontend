'use client';

import { useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import HelpIcon from '@/components/HelpIcon';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  findCountry,
  flagOf,
  phoneBlocker,
  toE164,
  type Country,
} from '@/lib/countries';

/**
 * A phone number in two parts: the country from a list, and the rest typed
 * as the person writes it at home. Typing the whole international number
 * was one keystroke away from a code texted to a stranger — +92 and +924
 * are both plausible to somebody who has never written their own number
 * that way — and a list of names cannot be mistyped.
 *
 * It opens on this portal's own country rather than guessing from the
 * browser, which reports en-US to half the world. That is a head start for
 * almost everybody and a wrong answer for the rest — so what was composed
 * is spelt out underneath, where somebody abroad can see at a glance that
 * the country needs changing before they wait for a text.
 */
export default function PhoneField({
  canText,
  onChange,
}: {
  /** Whether the portal has an SMS gateway — the note under the field says so either way. */
  canText: boolean;
  /** The composed international number (empty until there is one), and what still blocks it. */
  onChange: (phone: string, blocker: string | null) => void;
}) {
  const [country, setCountry] = useState<Country | null>(findCountry(DEFAULT_COUNTRY));
  const [typed, setTyped] = useState('');

  const update = (nextCountry: Country | null, nextTyped: string) => {
    setCountry(nextCountry);
    setTyped(nextTyped);
    onChange(toE164(nextCountry, nextTyped), phoneBlocker(nextCountry, nextTyped));
  };

  const composed = toE164(country, typed);

  return (
    <div>
      <label htmlFor="phone" className="text-sm font-medium">
        Phone <span className="font-normal text-[var(--text-color-secondary)]">(optional)</span>
        <HelpIcon topic="register.phone" label="About the phone number" />
      </label>
      <div className="mt-1 flex gap-2">
        <Dropdown
          inputId="phone-country"
          aria-label="Country code"
          value={country}
          onChange={(e) => update(e.value as Country | null, typed)}
          options={COUNTRIES}
          optionLabel="name"
          dataKey="iso"
          placeholder="Country"
          // Two hundred and thirty names is a scroll; typing "pak" or "92"
          // is not. Both fields are searched for that reason.
          filter
          filterBy="name,dial"
          filterPlaceholder="Search countries"
          resetFilterOnHide
          // The panel is sized to the trigger unless it is told otherwise, and
          // a trigger this narrow would clip every name in the list.
          panelClassName="w-72 max-w-[calc(100vw-3rem)]"
          // Collapsed it is a flag and a code, so the number beside it keeps
          // the room. Open, it is the name people are actually looking for.
          valueTemplate={(c: Country | null) =>
            c ? (
              <span className="whitespace-nowrap">
                <span aria-hidden>{flagOf(c.iso)}</span> {c.dial}
              </span>
            ) : (
              <span className="text-[var(--text-color-secondary)]">Country</span>
            )
          }
          itemTemplate={(c: Country) => (
            <span className="flex items-center gap-2">
              <span aria-hidden>{flagOf(c.iso)}</span>
              <span className="grow truncate">{c.name}</span>
              <span className="tabular-nums text-[var(--text-color-secondary)]">{c.dial}</span>
            </span>
          )}
          className="w-[8.5rem] shrink-0"
        />
        <InputText
          id="phone"
          type="tel"
          autoComplete="tel-national"
          value={typed}
          onChange={(e) => update(country, e.target.value)}
          // w-full as well as flex-1: an input carries an intrinsic width of
          // twenty characters, and in a flex row that width becomes the row's
          // minimum — enough to push the whole join card past a phone screen.
          className="w-full min-w-0 flex-1"
          placeholder="300 1234567"
          maxLength={20}
        />
      </div>
      {/* Honest about what the number will do here: the field shows either
          way, and on a portal that cannot text it says so. Once there is a
          number, what will actually be texted outranks the explanation —
          a wrong country is only visible if the whole number is. */}
      <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
        {composed ? (
          <>
            We will text{' '}
            <span className="font-medium tabular-nums text-[var(--text-color)]">{composed}</span>
            {canText ? '.' : ' — but this portal cannot send texts yet, so your code will come by email.'}
          </>
        ) : canText ? (
          'A code is texted here as well as emailed — either one confirms your account.'
        ) : (
          'This portal cannot send texts yet, so your code will come by email.'
        )}
      </p>
    </div>
  );
}

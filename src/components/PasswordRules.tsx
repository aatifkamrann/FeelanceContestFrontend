'use client';

import { PASSWORD_RULES } from '@/lib/password';

/**
 * The five things a new password needs, ticked off while somebody types
 * rather than told to them after they have submitted. Shown wherever a
 * password is chosen — joining, a reset from an emailed link, the first
 * administrator in the setup wizard — so the rule is learnt once and looks
 * the same every time.
 *
 * The API holds the same five (Auth/PasswordRules.cs) and is the one that
 * decides; this is only what the form says while you type.
 */
export default function PasswordRules({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.met(password);
        return (
          <li
            key={rule.label}
            className={`flex items-center gap-1.5 text-xs ${
              met ? 'text-[var(--primary-color)]' : 'text-[var(--text-color-secondary)]'
            }`}
          >
            <i className={`pi ${met ? 'pi-check-circle' : 'pi-circle'} text-[0.7rem]`} aria-hidden />
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

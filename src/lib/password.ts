/**
 * What a new password must have, and whether this one has it yet.
 *
 * The same five requirements the API holds in Auth/PasswordRules.cs, which
 * is the one that decides — this copy exists so the join form can tick them
 * off while somebody types, instead of teaching the rule by refusing a form
 * they have already filled in. If one list changes the other has to.
 *
 * The tests are Unicode classes rather than A-Z: a Cyrillic capital is an
 * uppercase letter, and char.IsUpper on the API agrees.
 */
export type PasswordRule = { label: string; met: (password: string) => boolean };

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { label: `${PASSWORD_MIN_LENGTH}+ characters`, met: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { label: 'Uppercase letter', met: (p) => /\p{Lu}/u.test(p) },
  { label: 'Lowercase letter', met: (p) => /\p{Ll}/u.test(p) },
  { label: 'Number', met: (p) => /\p{Nd}/u.test(p) },
  // Anything that is not a letter and not a digit, which is what the API's
  // !char.IsLetterOrDigit comes to. A space counts, and so it should.
  { label: 'Special character', met: (p) => /[^\p{L}\p{Nd}]/u.test(p) },
];

export const passwordAcceptable = (password: string): boolean =>
  PASSWORD_RULES.every((rule) => rule.met(password));

/**
 * The JWT settings group as the screens edit it: its keys, what a value may
 * be, and a new signing key.
 *
 * The API holds the same limits in Auth/JwtSettings.cs, and it is the one
 * that decides — this copy exists so the setup wizard can say what is wrong
 * before the last step rather than after it. If one changes the other has to.
 */
export const JWT_KEYS = {
  issuer: 'jwt.issuer',
  audience: 'jwt.audience',
  signingKey: 'jwt.signingKey',
  accessMinutes: 'jwt.accessTokenMinutes',
  refreshDays: 'jwt.refreshTokenDays',
} as const;

export const JWT_DEFAULTS = { issuer: 'WinnersPortal', audience: 'WinnersPortal', accessMinutes: '60', refreshDays: '30' };

const MAX_NAME_LENGTH = 200;
const MIN_KEY_BYTES = 32;

/** A new signing key as the API keeps one: base64 of 32 random bytes, made in this browser and sent only on save. */
export function newSigningKey(): string {
  const bytes = new Uint8Array(MIN_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

const whole = (value: string, min: number, max: number) =>
  /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max;

const keyBytes = (value: string) => {
  try {
    return atob(value.trim()).length;
  } catch {
    return 0;
  }
};

/** Why a value cannot be saved under a JWT key, or null when it can. Blank lifetimes and names fall back to the default. */
export function jwtProblem(key: string, value: string): string | null {
  switch (key) {
    case JWT_KEYS.issuer:
    case JWT_KEYS.audience:
      return value.trim().length > MAX_NAME_LENGTH
        ? `The ${key === JWT_KEYS.issuer ? 'issuer' : 'audience'} can be at most ${MAX_NAME_LENGTH} characters.`
        : null;
    case JWT_KEYS.accessMinutes:
      return value.trim() === '' || whole(value, 5, 1440)
        ? null
        : 'The access token lifetime must be a whole number of minutes from 5 to 1440 (a day).';
    case JWT_KEYS.refreshDays:
      return value.trim() === '' || whole(value, 1, 365)
        ? null
        : 'The refresh token lifetime must be a whole number of days from 1 to 365.';
    case JWT_KEYS.signingKey:
      // Blank keeps the key the API already has.
      return value.trim() === '' || keyBytes(value) >= MIN_KEY_BYTES
        ? null
        : `The signing key must be base64 of at least ${MIN_KEY_BYTES} bytes — use Generate for one.`;
    default:
      return null;
  }
}

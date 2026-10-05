'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { Message } from 'primereact/message';
import AuthShell from '@/components/AuthShell';
import CaptchaWidget from '@/components/CaptchaWidget';
import ConfirmCodeForm, { VERIFY_TITLE, verifyLede } from '@/components/ConfirmCodeForm';
import HelpIcon from '@/components/HelpIcon';
import PortalNote from '@/components/PortalNote';
import PasswordRules from '@/components/PasswordRules';
import PhoneField from '@/components/PhoneField';
import SignupRail from '@/components/SignupRail';
import { brandingQuery } from '@/lib/api';
import { meQuery, postJson, startFreshAt, type CodeSentTo } from '@/lib/opportunities';
import { passwordAcceptable } from '@/lib/password';

/**
 * Where to go once signed up, from ?next= — only a path on this portal, as
 * on the sign-in page. An opportunity page sends its visitors here with the
 * opportunity as next, so joining lands them on the brief they came for.
 */
function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

const ROLES = [
  {
    value: 'freelancer',
    title: "I'm a freelancer",
    detail: 'Enter opportunities, build in a private repo, win awards.',
    icon: 'pi-code',
  },
  {
    value: 'client',
    title: 'I need software built',
    detail: 'Post a brief with a fixed award, review code, pay the winner.',
    icon: 'pi-briefcase',
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [role, setRole] = useState('freelancer');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // What the phone field still wants, in the words the button will wear.
  const [phoneProblem, setPhoneProblem] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Set once the account exists: the card then shows the code form in
  // place of the fields, and stays there until a code comes back.
  const [pending, setPending] = useState<{ sentTo: CodeSentTo; phoneFailed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const { data: publicInfo } = useQuery(brandingQuery);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaSiteKey = publicInfo?.captchaSiteKey ?? null;
  const phoneCodes = publicInfo?.phoneCodes ?? false;
  // Null when the portal has no terms — then there is nothing to accept.
  const termsVersion = publicInfo?.termsVersion ?? null;
  const privacyPublished = publicInfo?.privacyPublished ?? false;
  // Whatever still stands between the form and the API is named on the
  // button, so a greyed-out button never leaves someone guessing why. In
  // the order the fields appear, so the label tracks where they are.
  const blocker =
    phoneProblem ??
    (password === ''
      ? 'Choose a password'
      : !passwordAcceptable(password)
        ? 'Finish the password'
        : confirmPassword !== password
          ? 'The passwords do not match'
          : termsVersion !== null && !acceptTerms
            ? 'Accept the terms to continue'
            : captchaSiteKey && !captchaToken
              ? 'Complete the challenge above'
              : null);

  // Signed in already: there is no account to create, so the visitor goes
  // home. The form itself signs a new account in, and while it is busy the
  // submit handler decides where that account goes, not this.
  const { data: me } = useQuery(meQuery);
  const alreadySignedIn = busy || pending ? null : me;
  useEffect(() => {
    if (alreadySignedIn) router.replace(safeNext());
  }, [alreadySignedIn, router]);

  // Where a confirmed account goes. A new client goes to post. A freelancer
  // goes back to whatever brought them here — an opportunity they were about to
  // enter outranks anything — and otherwise to step three of the rail, on
  // their profile, which is the one thing a brand-new account has that
  // clients will actually read.
  // A page load, not a client-side move: whoever this tab held before —
  // an account signed out of here, or one whose session lapsed — must not
  // hand the new one its profile.
  const land = () => {
    const next = safeNext();
    startFreshAt(role === 'client' ? '/client/opportunities' : next === '/' ? '/profile?step=3&welcome=1' : next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await postJson<{ sentTo: CodeSentTo; phoneFailed: boolean }>('/api/auth/register', {
        email,
        password,
        displayName,
        role,
        captchaToken,
        acceptTerms,
        phone,
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      // The account exists and is signed in, but can do nothing yet: the
      // code is the second step of this same card, not a page elsewhere.
      setPending({ sentTo: created.sentTo, phoneFailed: created.phoneFailed });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
      setBusy(false);
    }
  };

  // The rail counts the same steps whichever half of the card is showing.
  const rail = <SignupRail role={role} current={pending ? 2 : 1} />;

  if (pending) {
    return (
      <AuthShell title={VERIFY_TITLE} wide aside={rail}>
        <p className="mt-4 text-sm text-[var(--text-color-secondary)]">{verifyLede(role)}</p>
        <div className="mt-5">
          <ConfirmCodeForm
            sentTo={pending.sentTo}
            phoneFailed={pending.phoneFailed}
            role={role}
            onConfirmed={land}
          />
        </div>
      </AuthShell>
    );
  }

  if (alreadySignedIn) {
    return (
      <AuthShell title="You're already signed in">
        <p className="mt-6 text-sm text-[var(--text-color-secondary)]">
          Signed in as {alreadySignedIn.displayName}. To create another account, sign out first.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create an account" wide aside={rail}>
      <h2 className="mt-4 text-base font-semibold">Start Your Professional Profile</h2>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        Build your professional profile, prove your expertise, and unlock opportunities matched to your
        strengths.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <fieldset>
          <legend className="text-sm font-medium">
            What brings you here?
            <HelpIcon topic="register.role" label="Choosing your role" />
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                aria-pressed={role === r.value}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  role === r.value
                    ? // lara's --highlight-bg is a solid dark accent, not a
                      // tint — mix our own so the card text stays readable
                      'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_10%,transparent)]'
                    : 'border-[var(--surface-border)] hover:border-[var(--primary-color)]'
                }`}
              >
                <i className={`pi ${r.icon} text-[var(--primary-color)]`} aria-hidden />
                <p className="mt-1 text-sm font-medium">{r.title}</p>
                <p className="mt-1 text-xs text-[var(--text-color-secondary)]">{r.detail}</p>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="name" className="text-sm font-medium">
            Display name <span className="font-normal text-[var(--text-color-secondary)]">(public)</span>
          </label>
          <InputText
            id="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
          />
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <InputText
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full"
            required
          />
        </div>
        {/* A portal with no SMS gateway can do nothing with a number, so it
            does not ask for one — the code comes by email either way. */}
        {phoneCodes && (
          <PhoneField
            canText
            onChange={(value, problem) => {
              setPhone(value);
              setPhoneProblem(problem);
            }}
          />
        )}
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Password
            inputId="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            feedback={false}
            toggleMask
            autoComplete="new-password"
            inputClassName="w-full"
            className="mt-1 w-full"
            aria-describedby="password-rules"
            required
          />
          <PasswordRules password={password} id="password-rules" />
        </div>
        <div>
          <label htmlFor="confirm-password" className="text-sm font-medium">
            Confirm password
          </label>
          <Password
            inputId="confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            feedback={false}
            toggleMask
            autoComplete="new-password"
            inputClassName="w-full"
            className="mt-1 w-full"
            required
          />
          {confirmPassword !== '' && confirmPassword !== password && (
            <p className="mt-1 text-xs text-red-500">Both boxes have to say the same thing.</p>
          )}
        </div>

        {termsVersion !== null && (
          // The account is created already having accepted the version
          // that stands; the API refuses to create one otherwise.
          <div className="flex items-start gap-2">
            <Checkbox inputId="acceptTerms" checked={acceptTerms} onChange={(e) => setAcceptTerms(!!e.checked)} />
            <label htmlFor="acceptTerms" className="text-sm">
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="text-[var(--primary-color)]">
                Terms of Service
              </Link>
              {privacyPublished && (
                <>
                  {' '}
                  and{' '}
                  <Link href="/privacy" target="_blank" className="text-[var(--primary-color)]">
                    Privacy Policy
                  </Link>
                </>
              )}{' '}
              (terms version {termsVersion}).
            </label>
          </div>
        )}
        {/* No terms to accept, but a policy worth reading before handing
            over an email address. */}
        {termsVersion === null && privacyPublished && (
          <p className="text-sm text-[var(--text-color-secondary)]">
            What becomes of what you write here is set out in our{' '}
            <Link href="/privacy" target="_blank" className="text-[var(--primary-color)]">
              Privacy Policy
            </Link>
            .
          </p>
        )}

        <PortalNote>
          <p>
            Welcome. I&apos;ll help you build a stronger profile and identify opportunities that match your
            expertise.
          </p>
        </PortalNote>

        {captchaSiteKey && <CaptchaWidget siteKey={captchaSiteKey} onToken={setCaptchaToken} />}

        {error && <Message severity="error" text={error} className="w-full" />}
        <Button type="submit" label={blocker ?? 'Create account'} loading={busy} disabled={blocker !== null} />
      </form>

      <p className="mt-4 text-sm text-[var(--text-color-secondary)]">
        Already have one?{' '}
        <Link href="/login" className="text-[var(--primary-color)]">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

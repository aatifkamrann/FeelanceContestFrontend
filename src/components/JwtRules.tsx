/**
 * The rules the JWT settings live by, at the foot of their panel in the
 * setup wizard and on the settings screen. Written for this portal: a token
 * here is not stateless — every request reads the account — so a lock ends
 * a session at once, and a new key is not the only way to end one.
 */
export default function JwtRules() {
  return (
    <div className="flex gap-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-ground)] p-3 text-sm">
      <i className="pi pi-info-circle wp-note-icon" aria-hidden />
      <div className="flex flex-col gap-2">
        <p className="m-0 font-medium">
          Signed-in sessions last about 7 days in the browser, renewed while in use. An app holding a token pair stays
          signed in for the refresh token lifetime above.
        </p>
        <p className="m-0 text-[var(--text-color-secondary)]">
          Tokens are not stateless here: every request reads the account from the database, so locking or deleting an
          account, or changing its password, ends its sessions at the next request. Rotating the signing key, or
          changing the issuer or the audience, ends every session once the API restarts.
        </p>
      </div>
    </div>
  );
}

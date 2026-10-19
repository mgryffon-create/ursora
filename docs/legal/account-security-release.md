# Account agreements and security release

Operator confirmed: Rachelle Olsen, Texas, USA; mgryffon@icloud.com.
Published version: `2026-10-19.1`, source `src/lib/legal-notice.md`.

- `/legal` is public, printable and available without a brokerage refresh. `?version=` retrieves archived documents.
- Signup requires explicit unchecked adult/US/terms assent and privacy receipt. An auth.users creation trigger checks current document version and affirmative boolean inputs in the same transaction. The signup inputs are not used as authorization claims; a separate protected ledger becomes authoritative.
- `legal_receipts` records server timestamps, action, version and content SHA-256. Clients may read only their own records; they have no direct write/update/delete grants. Authenticated RPCs validate the user, MFA status and current document version before recording an idempotent receipt. No IP addresses or financial records are copied into this ledger.
- The first-login gate requires the privacy acknowledgement and, for pre-existing users, terms assent. Records are available in Account & security. Closing the browser does not fabricate an acknowledgement.
- Account & security provides display-name edits, email-change confirmation, password changes, TOTP enrollment/verification/removal and other-session signout. Email is the login identifier; there is no separate username directory or public account lookup.
- Recovery emails target `/account/recovery`; implicit recovery callbacks landing on the root also route to that page. Recovery requires a valid authenticated recovery/session context and rejects invalid/mismatched input. MFA remains enrolled after password recovery.
- MFA enforcement: additive restrictive policies on public RLS tables with a user_id column; checks use actual verified auth.mfa_factors, not user-editable metadata. Protected financial/billing endpoints call the authenticated `account_api_allowed` RPC using the caller's JWT after authenticating. This does not claim every pre-existing public/market-only endpoint has undergone a full security audit.
- Deployment patches preserve deployed implementations and JWT settings in these functions: snaptrade-register-user-v2, snaptrade-connection-portal-v2, sync-snaptrade-accounts-v2, normalize-snaptrade-trades-v2, historical-session-playback, reconstruct-historical-trades, sync-webull-history, ursora-billing, build-trade-structure, sync-tradecycle-lifecycle, ai-analyst, run-analysis.
- Secrets for authenticator enrollment are displayed transiently to the user. They are not copied into URSORA local storage or logs by the new UI. Authentication factors remain hosted by the existing Supabase authentication service; this adds no SMS delivery vendor. Users must arrange a secure authenticator backup. No recovery codes or automatic MFA-bypass support mechanism are advertised.
- Beta membership hides pricing cards and subscription prompts while beta access is enabled. Existing billing management remains available.

## Operational checks

Check Supabase email confirmation and secure email-change configuration, production email delivery, recovery redirect allowlist and custom SMTP deliverability using controlled real mailboxes. No emails were sent to a real user as part of the browser fixture checks. Enforce provider-side password requirements and enable leaked-password protection where supported. Do not remove verified MFA factors merely on an emailed assertion of identity; establish a documented recovery-verification process first.

The Supabase advisor still reports pre-existing mutable-search-path functions, the intentionally public CRM submission RPC and disabled leaked-password protection. The three new authenticated SECURITY DEFINER APIs are intentionally callable, use a fixed empty search_path, take no arbitrary user ID and restrict access to the caller's own state. Server-only tables without permissive client policies remain fail-closed.

Legal wording needs qualified legal review for actual business practices and applicable law. Acceptance mechanics do not establish regulatory compliance or authorize future live trading.

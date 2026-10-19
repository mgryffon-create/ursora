# Agreement release plan

Historical planning document. Superseded for version 2026-10-19.1 by `account-security-release.md` and the published `src/lib/legal-notice.md`. The original `user-agreement-draft.md` remains a historical draft, not the active agreement.

## Source findings (2026-10-19)

- `supabase/migrations/20260924_snaptrade_integration.sql`: balances, holdings, activities and raw JSON; server-only credential table with no client policies. Ownership policies do not prevent privileged operator access.
- `supabase/functions/snaptrade-connection-portal-v2/index.ts`: `connectionType: 'read'`.
- `src/lib/brokerage-bootstrap.ts`, `src/main.tsx`: bootstrap and daily refresh of authorized connections. Public legal routes should bypass these operations.
- `src/contexts/AuthContext.tsx`: signup also submits contact email/metadata to `crm_submit_contact`; separate this from optional marketing permission and verify CRM tenancy/access.
- `src/lib/db.ts`: persisted/refreshing auth sessions in browser storage.
- `src/lib/api.ts`: analytics `track` currently no-op; this does not establish absence of hosting/request logs.
- `supabase/functions/ai-analyst/index.ts`: structured stored-context response, no external model request in this checked-in endpoint. Deployed configuration still needs verification.
- `src/components/learn/UniversityBilling.tsx`: Stripe checkout/portal integration; verify deployed billing processor and cancellation behavior.

This is a source inventory, not a production security audit or proof of legal compliance.

## Public documents

Publish stable `/legal/terms`, `/legal/privacy`, `/legal/brokerage` routes without login, brokerage bootstrap or connection refresh. Include persistent footer/account links, effective versions, print support and archived versions. Split the draft into those documents after legal review so receipt of a privacy notice is distinct from agreement to service terms.

## Acceptance and brokerage notice

Use the prepared `AgreementAcceptance` component only after approved versions are published. At signup, require unchecked terms agreement and age confirmation; link privacy notice with separate acknowledgement. Keep marketing opt-in separate and optional. Show the concise brokerage disclosure before creating a connection portal; never default it checked. Existing users receive a versioned review before new imports. Preserve a route to sign out, read documents and submit privacy requests without accepting.

Store acceptance in a protected append-only server ledger: authenticated user, document kind/version and immutable content digest, server timestamp, action and UI notice version. Prevent client updates/deletes or choosing another user ID; do not use editable auth user_metadata as enforceable consent. Minimize network identifiers; do not copy financial records into consent logs. Enforce required acceptance server-side at register/connect/sync endpoints, including legacy endpoint aliases, and block bootstrap before acceptance. Verify signed-in identity and requested version on server. Retrying must be idempotent. Do not claim a checkbox alone implements server enforcement.

Acceptance withdrawal is not necessarily withdrawal of every legal basis; explain effects accurately. Stopping imports, account deletion, contractual termination, optional marketing consent and notice acknowledgement are distinct actions.

## Controls to complete before release

Document privileged roles; least privilege and auditable access; verify actual deployed RLS/grants and credential handling; vendor/subprocessor register; raw-import minimization/redaction; retention schedule and backup expiry; request verification/export/deletion/revocation; session revocation; incident response; CRM separation and optional marketing; age and geographic eligibility; tested billing cancellation. These are open tasks, not controls claimed as already implemented.

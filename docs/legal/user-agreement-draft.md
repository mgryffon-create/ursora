# URSORA user agreement and privacy notice

**Draft for operator and legal review — not effective or presented for acceptance.**

Version: draft-2026-10-19. Effective date: to be set at publication.
Operator: [legal name and business address required]. Privacy contact: [monitored email required]. Governing jurisdiction and intended service countries: [required].

## Before you join

URSORA provides trading education, research, simulations and optional connected-account analysis. It processes information to provide those services; it does not simply leave your information unused. Connecting a brokerage is optional. You can use education without authorizing a brokerage connection.

By accepting the published agreement, you agree to the service terms. A separate acknowledgement confirms you received the privacy notice. Brokerage authorization is a separate choice made before connecting. These choices do not authorize advertising, sale of personal information, unrelated research, external AI training or trading on your behalf.

## 1. What you provide and what the service receives

- Account information: email, account identifier, sign-in information handled by the authentication service, display name and preferences. The current signup code also submits your email and signup metadata to the operator’s CRM; SMS opt-in is false. This contact record is distinct from brokerage data.
- Learning and activity information: onboarding answers, lesson progress, assessment responses, simulated orders and trades, watchlists, favorites, trading plans, profile responses, analyst conversations and preferences you save.
- Connected financial information: when you authorize a brokerage connection, available account identifiers, institution and account names, masked numbers, account type/status, total value, balances, cash, buying power, holdings, quantities, prices, cost basis, option terms, transaction descriptions, executions, dates, settlement dates, fees and derived trade episodes. Availability depends on your broker and connection. Raw account, position and activity provider responses may also be retained, so storage is not restricted to the fields displayed on screen.
- Technical information: authentication/session records, request and error logs, timestamps and network information processed by infrastructure providers. Your browser stores session tokens, remembered email, preferences and learning caches. Shared devices may expose browser-stored information; sign out and clear site storage where appropriate.

Do not enter brokerage passwords, government identifiers, full payment-card details or unrelated sensitive information in lessons, analyst chat, support messages or free-text fields. Brokerage credentials should be entered only in the provider’s authorized connection flow.

## 2. Why URSORA uses information

To authenticate you; save and synchronize your work; display authorized financial history; reconstruct and review trades; generate educational, behavioral and market context; maintain subscriptions if you choose one; prevent abuse; troubleshoot faults; respond to support and privacy requests; and meet applicable legal obligations. Derived assessments can be incomplete, incorrect or misleading and are not authoritative broker statements.

**Proposed operating commitments requiring operator approval:** do not sell or rent personal or connected financial information; do not disclose it for cross-context behavioral advertising; do not use private financial records to train external general-purpose AI models; do not repurpose private records for unrelated commercial research. These are proposed commitments, not findings that all production vendors and practices have been audited. Remove this drafting note only after verifying and adopting them.

## 3. Who can see information

Other ordinary users are not intended to see your private account records. The checked-in brokerage schema uses account-owner row restrictions for client reads. This does not mean administrators cannot access records.

Authorized operators and people with privileged database, backend, infrastructure or support access may technically access stored account, learning, conversation and financial records, including raw imports and integration credentials. Service-role backend processes can bypass ordinary client row restrictions. A brokerage provider connection secret is stored server-side and is not the same as your brokerage password. This notice does not claim that administrators cannot access it or that it is protected by field-level encryption.

**Required operating policy:** privileged human access must be limited to a legitimate support, security, maintenance or legal need; restricted to the minimum necessary; prohibited for curiosity, personal trading, marketing or personal gain; and reviewed and logged. Do not promise that a complete access-audit system exists until it is implemented and verified. Users should not send secrets to an administrator.

Service providers process information needed to operate the service. The source integrates Supabase for authentication/database/backend services, SnapTrade and your selected broker for connections/imports, Vercel for hosting, Stripe for enabled subscription checkout and billing, and an operator CRM signup integration. Not every provider receives every category of information. Payment-card entry belongs in Stripe’s hosted flow, not URSORA forms. Provider terms and privacy notices apply to their own processing. Exact vendors, subprocessors, regions and contractual protections must be confirmed before publication.

The checked-in analyst endpoint produces responses from stored structured records without an external language-model call. This is not an assurance about every deployed function or vendor. Any future external AI processing of private records requires a revised notice, provider review and appropriate user choice before enabling it.

Information may also be disclosed where legally required, to address fraud or security threats, or during a business transfer subject to appropriate confidentiality and applicable law. No blanket permission to publish private records is granted.

## 4. Brokerage authorization and control

The checked-in connection portal requests read access. Its purpose is importing and reviewing account information, not placing trades or moving funds. Check the permissions displayed by your broker/provider before proceeding. URSORA’s simulations are not live brokerage orders. Future execution permissions require a separate release and explicit authorization.

Imports can include activity before the date you signed up. The app may refresh an existing authorized connection when you use it. Revoke access through your brokerage or connection provider to stop further access where a working in-app disconnect is unavailable. Disconnecting does not itself delete previously imported records, derived reviews, backups or the provider’s own records. Do not interpret a missing chart as proof that no financial data was stored.

## 5. Retention, requests and deletion

Records persist in account storage, browser caches, provider systems and potentially backups/logs. Deletion is not necessarily immediate or simultaneous across those systems. Financial records may be retained separately from a CRM contact record or billing record. The published notice must specify adopted retention periods or criteria for each category and backup expiration, rather than promise indefinite or immediate erasure without an implemented process.

You may request access, a copy, correction or deletion, and ask about uses or recipients, using the published monitored privacy contact. Identity verification should be proportionate and must not require sending a brokerage password. Applicable rights and exceptions depend on your location. Requests must be tracked and answered within applicable deadlines. Explain any legal retention exception and provide a complaint/escalation route. There is currently no verified self-service account-wide export or deletion workflow in this source audit; do not advertise one as available.

Deleting an account must include revoking sessions and provider authorizations as appropriate, identifying linked imports and derived records, and handling CRM/billing/backups under the adopted schedule. Clearing local storage or signing out alone does not delete server records.

## 6. Security and incidents

Authentication, client access restrictions and server-side integration boundaries reduce risk but cannot eliminate it. No system is guaranteed secure. Do not claim end-to-end encryption, field-level encryption, independent certification, a complete security audit or guaranteed administrator invisibility without evidence. The operator must maintain access controls, credential protection, incident response, vendor oversight and legally required incident notifications. A privacy notice is not a substitute for those controls.

## 7. Your responsibilities and service limits

Use only an account and financial records you own or are authorized to use. Protect your login, keep your contact details current, review connection permissions, and notify the published security contact of suspected unauthorized access. Do not interfere with security, scrape private accounts, upload unlawful material or use the service to mislead others.

URSORA is an educational and research tool. It does not manage assets or provide individualized legal, tax or investment advice. Scores, thesis labels, exercises and historical simulations are not guarantees, probabilities of profit or proof of suitability. Data may be delayed, missing, inaccurate or reconstructed. Simulations omit aspects of real execution. Trading, especially options, can produce substantial losses. Independently verify decisions and official account records.

You retain rights in your own submissions. You permit URSORA to process them only as necessary for the disclosed service purposes and legal obligations. Do not upload content you lack permission to provide. URSORA retains rights in its own software and educational material, subject to third-party rights.

Any paid plan must disclose price, billing interval, renewal, cancellation, refund policy and trial/beta transition before purchase. No subscription charge is authorized merely by accepting this agreement or connecting a brokerage. Do not describe proposed tier benefits as released features.

Access may be restricted for security, abuse, nonpayment where applicable or service discontinuation, with notice where practicable and legally required. Users may stop using the service and request deletion. Terms must preserve non-waivable consumer/privacy rights. No mandatory arbitration, class-action waiver, dollar liability cap or chosen governing law has been inserted without operator and qualified counsel review.

## 8. Age, geography and changes

Proposed eligibility: adults 18 or older with capacity to agree. This age rule must be implemented and intended countries confirmed before representing it as enforced. If underage information is discovered, follow applicable law and a documented deletion/escalation process.

Publish the effective date and version; keep prior versions accessible. Notify users of material changes before they take effect where required. Seek renewed agreement for changed contractual terms and separate authorization for materially expanded data uses or brokerage permissions where required. Continued use must not be used as a substitute for consent when affirmative consent is required.

## Publication checklist

Resolve operator identity, address, contact, countries and governing-law review; inventory production vendors/functions and CRM access; verify actual grants/RLS and administrator roles; approve no-sale/no-advertising/no-training commitments; adopt retention and incident procedures; provide tested request handling and brokerage revocation guidance; verify billing cancellation/refunds and age policy; obtain qualified legal review. Determine applicable privacy/financial-service obligations based on actual business activities and locations rather than assume that a generic website agreement satisfies them.

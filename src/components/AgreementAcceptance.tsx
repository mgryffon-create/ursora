import React from 'react';

/** Explicit signup assent; authoritative receipt is created by the server. */
export function AgreementAcceptance({ checked, onChange, termsUrl, privacyUrl }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  termsUrl: string;
  privacyUrl: string;
}) {
  return <fieldset className="space-y-2 rounded border border-zinc-700 p-3 text-sm text-zinc-200">
    <legend className="px-1 font-semibold">Before creating an account</legend>
    <p>Your account and authorized financial imports are stored to provide learning and analysis. Authorized operators and service providers may access records for the disclosed purposes.</p>
    <label className="flex items-start gap-2">
      <input type="checkbox" required checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1 shrink-0" />
      <span>I am at least 18, live in the United States, acknowledge receiving the Privacy Notice below, and agree to the <a className="text-sky-300 underline" href={termsUrl} target="_blank" rel="noopener noreferrer">User Agreement (opens a new tab)</a>.</span>
    </label>
    <p>Read how information is collected, used and accessed in the <a className="text-sky-300 underline" href={privacyUrl} target="_blank" rel="noopener noreferrer">Privacy Notice (opens a new tab)</a>. Brokerage access is optional and requires separate authorization. This agreement does not authorize marketing or a subscription charge.</p>
  </fieldset>;
}

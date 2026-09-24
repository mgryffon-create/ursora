import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Save, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchTraderProfile, saveTraderProfile } from '@/lib/api';
import type { TraderProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Panel, SectionHeading, Spinner } from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

type Choice = { value: string; label: string };

const BROKERAGES: Choice[] = [
  { value: 'webull', label: 'Webull' },
  { value: 'robinhood', label: 'Robinhood' },
  { value: 'fidelity', label: 'Fidelity' },
  { value: 'schwab', label: 'Schwab' },
  { value: 'etrade', label: 'E*TRADE' },
  { value: 'interactive_brokers', label: 'Interactive Brokers' },
  { value: 'public', label: 'Public' },
  { value: 'tastytrade', label: 'tastytrade' },
  { value: 'other', label: 'Other' },
];

const STYLES: Choice[] = [
  { value: '0dte', label: '0DTE / same-day' },
  { value: 'intraday', label: 'Intraday' },
  { value: 'swing_1_5d', label: 'Swing · 1–5 days' },
  { value: 'short_term_1_4w', label: 'Short-term · 1–4 weeks' },
  { value: 'long_term', label: 'Long-term' },
];

const TRADE_TYPES: Choice[] = [
  { value: 'long_calls', label: 'Long calls' },
  { value: 'long_puts', label: 'Long puts' },
  { value: 'shares', label: 'Shares' },
  { value: 'debit_spreads', label: 'Debit spreads' },
  { value: 'credit_spreads', label: 'Credit spreads' },
  { value: 'covered_calls', label: 'Covered calls' },
  { value: 'cash_secured_puts', label: 'Cash-secured puts' },
  { value: 'other', label: 'Other' },
];

const PRIMARY_GOALS: Choice[] = [
  { value: 'grow_capital', label: 'Grow capital' },
  { value: 'income', label: 'Generate income' },
  { value: 'consistency', label: 'Build consistency' },
  { value: 'discipline', label: 'Reduce impulsive trading' },
  { value: 'repeatable_process', label: 'Build a repeatable process' },
  { value: 'hedge', label: 'Protect / hedge a portfolio' },
];

const URSORA_GOALS: Choice[] = [
  { value: 'find_setups', label: 'Find setups' },
  { value: 'choose_contracts', label: 'Choose contracts' },
  { value: 'stay_disciplined', label: 'Stay disciplined' },
  { value: 'thesis_weakening', label: 'Track thesis weakening' },
  { value: 'understand_habits', label: 'Understand my habits' },
  { value: 'position_sizing', label: 'Improve position sizing' },
  { value: 'reduce_overtrading', label: 'Reduce overtrading' },
  { value: 'review_what_works', label: 'Review what works' },
];

const HABITS: Choice[] = [
  { value: 'hold_losers', label: 'Hold losers too long' },
  { value: 'exit_winners_early', label: 'Exit winners too early' },
  { value: 'overtrade', label: 'Overtrade' },
  { value: 'size_up_emotionally', label: 'Size up emotionally' },
  { value: 'revenge_trade', label: 'Revenge trade' },
  { value: 'reenter_quickly', label: 'Re-enter too quickly' },
  { value: 'chase_moves', label: 'Chase moves' },
  { value: 'ignore_invalidation', label: 'Ignore invalidation' },
  { value: 'none_unsure', label: 'None / not sure' },
];

const EMPTY_PROFILE = (userId: string): TraderProfile => ({
  user_id: userId,
  brokerages: [],
  trading_styles: [],
  trade_types: [],
  primary_goals: [],
  profit_target_type: 'none',
  profit_target_value: null,
  risk_comfort: 'moderate',
  max_loss_type: 'none',
  max_loss_value: null,
  ursora_goals: [],
  self_reported_habits: [],
});

const ChipGroup: React.FC<{
  choices: Choice[];
  values: string[];
  onChange: (next: string[]) => void;
  max?: number;
}> = ({ choices, values, onChange, max }) => (
  <div className="flex flex-wrap gap-2">
    {choices.map((choice) => {
      const selected = values.includes(choice.value);
      return (
        <button
          key={choice.value}
          type="button"
          onClick={() => {
            if (selected) {
              onChange(values.filter((value) => value !== choice.value));
              return;
            }
            if (max && values.length >= max) return;
            onChange([...values, choice.value]);
          }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] transition-colors',
            selected
              ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
              : 'border-zinc-700 bg-black/20 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
          )}
        >
          {selected && <Check className="h-3 w-3" aria-hidden="true" />}
          {choice.label}
        </button>
      );
    })}
  </div>
);

const FieldTitle: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="mb-2">
    <div className="text-sm font-medium text-zinc-100">{title}</div>
    {hint && <div className="mt-0.5 text-[10px] text-zinc-500">{hint}</div>}
  </div>
);

const readableError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const row = error as Record<string, unknown>;
    const detail = [row.message, row.details, row.hint, row.code].filter(Boolean).join(' · ');
    if (detail) return detail;
    try { return JSON.stringify(error); } catch { return 'Trader profile could not be loaded.'; }
  }
  return 'Trader profile could not be loaded.';
};

const labelsFor = (values: string[], choices: Choice[]) =>
  values.map((value) => choices.find((choice) => choice.value === value)?.label ?? value.replaceAll('_', ' '));

const OverviewRow: React.FC<{ label: string; values: string[]; empty?: string }> = ({ label, values, empty = 'Not set' }) => (
  <div className="rounded-sm border border-zinc-800 bg-black/20 p-3">
    <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {values.length ? values.map((value) => (
        <span key={value} className="rounded-sm border border-zinc-700 bg-black/25 px-2 py-1 text-[10px] text-zinc-300">
          {value}
        </span>
      )) : <span className="text-[11px] text-zinc-600">{empty}</span>}
    </div>
  </div>
);

export const TraderProfileView: React.FC<{ onboarding?: boolean; onSaved?: () => void }> = ({ onboarding = false, onSaved }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<TraderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const existing = await fetchTraderProfile();
        if (active) {
          setProfile(existing ?? EMPTY_PROFILE(user.id));
          setHasSavedProfile(Boolean(existing));
          setEditing(!existing);
        }
      } catch (error) {
        if (active) {
          // The profile page is also the setup surface. A read/storage problem should
          // never turn the page into a dead end: keep an editable local profile visible
          // and show the underlying persistence error separately.
          setProfile(EMPTY_PROFILE(user.id));
          setHasSavedProfile(false);
          setEditing(true);
          setMessage(readableError(error));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [user]);

  const completion = useMemo(() => {
    if (!profile) return 0;
    const checks = [
      profile.brokerages.length > 0,
      profile.trading_styles.length > 0,
      profile.trade_types.length > 0,
      profile.primary_goals.length > 0,
      profile.ursora_goals.length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [profile]);

  if (loading) return <Spinner label="Loading trader profile" />;

  if (!user) {
    return (
      <Panel title="Trader profile">
        <p className="text-sm text-zinc-400">Sign in to create a persistent trader profile.</p>
      </Panel>
    );
  }

  if (!profile) return <Spinner label="Preparing trader profile" />;

  const update = <K extends keyof TraderProfile>(key: K, value: TraderProfile[K]) => {
    setProfile((current) => current ? { ...current, [key]: value } : current);
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { user_id: _userId, created_at: _created, updated_at: _updated, ...payload } = profile;
      await saveTraderProfile({ user_id: user.id, ...payload });
      setHasSavedProfile(true);
      setEditing(false);
      setMessage('Trader profile saved.');
      onSaved?.();
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Trader profile"
        title={editing ? 'Set your trading baseline' : 'Your trading baseline'}
        description={onboarding
          ? "This is optional, but Trader Intelligence becomes much more personal when URSORA knows your goals, style, risk comfort, and the habits you want to watch."
          : editing
            ? "Set or update the preferences Trader Intelligence uses as your personal reference point. These preferences never change the market thesis."
            : "A compact view of the goals, preferences, and habits URSORA uses as your personal reference point."}
        right={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-zinc-500">{completion}% complete</span>
            {editing ? (
              <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save profile
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => { setEditing(true); setMessage(null); }} className="gap-1.5 border-zinc-700">
                <Pencil className="h-3.5 w-3.5" />
                Edit profile
              </Button>
            )}
          </div>
        }
      />

      {message && (
        <div className={cn(
          'rounded-sm border px-3 py-2 text-[11px]',
          message === 'Trader profile saved.'
            ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-200'
            : 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200',
        )}>
          {message}
        </div>
      )}

      {!editing && hasSavedProfile ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <OverviewRow label="Brokerage" values={labelsFor(profile.brokerages, BROKERAGES)} />
            <OverviewRow label="Trading style" values={labelsFor(profile.trading_styles, STYLES)} />
            <OverviewRow label="Trade types" values={labelsFor(profile.trade_types, TRADE_TYPES)} />
            <OverviewRow label="Primary goals" values={labelsFor(profile.primary_goals, PRIMARY_GOALS)} />
            <OverviewRow label="URSORA focus" values={labelsFor(profile.ursora_goals, URSORA_GOALS)} />
            <OverviewRow label="Self-reported habits" values={labelsFor(profile.self_reported_habits, HABITS)} empty="No pattern flags set" />
          </div>

          <Panel title="Risk & targets" subtitle="Your stated boundaries, not market recommendations.">
            <div className="grid gap-2 sm:grid-cols-3">
              <OverviewRow label="Risk comfort" values={[profile.risk_comfort]} />
              <OverviewRow
                label="Profit target"
                values={profile.profit_target_type === 'none'
                  ? []
                  : [`${profile.profit_target_type.replaceAll('_', ' ')} · ${profile.profit_target_value ?? 'not set'}`]}
                empty="No fixed target"
              />
              <OverviewRow
                label="Max loss"
                values={profile.max_loss_type === 'none'
                  ? []
                  : [`${profile.max_loss_type.replaceAll('_', ' ')} · ${profile.max_loss_value ?? 'not set'}`]}
                empty="No fixed limit"
              />
            </div>
          </Panel>

          <Panel title="How Trader Intelligence uses this" subtitle="Your profile is a reference baseline, not a market input.">
            <div className="flex items-start gap-2">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
              <p className="text-[11px] leading-relaxed text-zinc-400">
                URSORA can compare your observed trading behavior with what you said you want to do — your preferred time horizon, risk comfort, targets, structures, and habits — while keeping market evidence separate.
              </p>
            </div>
          </Panel>
        </>
      ) : (
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Brokerage" subtitle="Where you trade today.">
          <ChipGroup choices={BROKERAGES} values={profile.brokerages} onChange={(value) => update('brokerages', value)} />
        </Panel>

        <Panel title="Trading style" subtitle="Select every horizon you actually use.">
          <ChipGroup choices={STYLES} values={profile.trading_styles} onChange={(value) => update('trading_styles', value)} />
        </Panel>

        <Panel title="Trade types" subtitle="Structures you actually like trading.">
          <ChipGroup choices={TRADE_TYPES} values={profile.trade_types} onChange={(value) => update('trade_types', value)} />
        </Panel>

        <Panel title="Primary goal" subtitle="What are you trying to accomplish?">
          <ChipGroup choices={PRIMARY_GOALS} values={profile.primary_goals} onChange={(value) => update('primary_goals', value)} max={2} />
        </Panel>

        <Panel title="Targets & risk" subtitle="Optional. These become reference points for Trader Intelligence.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldTitle title="Profit target" />
              <select
                value={profile.profit_target_type}
                onChange={(event) => update('profit_target_type', event.target.value as TraderProfile['profit_target_type'])}
                className="w-full rounded-sm border border-zinc-700 bg-black/30 px-2.5 py-2 text-xs text-zinc-200"
              >
                <option value="none">No fixed target</option>
                <option value="per_trade_dollar">$ per trade</option>
                <option value="per_trade_percent">% per trade</option>
                <option value="weekly_dollar">$ per week</option>
                <option value="monthly_dollar">$ per month</option>
              </select>
              {profile.profit_target_type !== 'none' && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={profile.profit_target_value ?? ''}
                  onChange={(event) => update('profit_target_value', event.target.value === '' ? null : Number(event.target.value))}
                  placeholder="Target"
                  className="mt-2 w-full rounded-sm border border-zinc-700 bg-black/30 px-2.5 py-2 font-mono text-xs text-zinc-200"
                />
              )}
            </div>

            <div>
              <FieldTitle title="Max loss per trade" />
              <select
                value={profile.max_loss_type}
                onChange={(event) => update('max_loss_type', event.target.value as TraderProfile['max_loss_type'])}
                className="w-full rounded-sm border border-zinc-700 bg-black/30 px-2.5 py-2 text-xs text-zinc-200"
              >
                <option value="none">No fixed limit</option>
                <option value="dollar">$ amount</option>
                <option value="percent">% of account / trade</option>
              </select>
              {profile.max_loss_type !== 'none' && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={profile.max_loss_value ?? ''}
                  onChange={(event) => update('max_loss_value', event.target.value === '' ? null : Number(event.target.value))}
                  placeholder="Max loss"
                  className="mt-2 w-full rounded-sm border border-zinc-700 bg-black/30 px-2.5 py-2 font-mono text-xs text-zinc-200"
                />
              )}
            </div>
          </div>

          <div className="mt-4">
            <FieldTitle title="Risk comfort" />
            <ChipGroup
              choices={[
                { value: 'conservative', label: 'Conservative' },
                { value: 'moderate', label: 'Moderate' },
                { value: 'aggressive', label: 'Aggressive' },
              ]}
              values={[profile.risk_comfort]}
              onChange={(values) => update('risk_comfort', (values.at(-1) ?? 'moderate') as TraderProfile['risk_comfort'])}
              max={1}
            />
          </div>
        </Panel>

        <Panel title="What do you want from URSORA?" subtitle="Pick up to three.">
          <ChipGroup choices={URSORA_GOALS} values={profile.ursora_goals} onChange={(value) => update('ursora_goals', value)} max={3} />
        </Panel>

        <Panel title="Your own pattern flags" subtitle="Optional self-report. Trader Intelligence can test these against real behavior later.">
          <ChipGroup choices={HABITS} values={profile.self_reported_habits} onChange={(value) => update('self_reported_habits', value)} />
        </Panel>

        <Panel title="How URSORA uses this" subtitle="Preferences guide fit; they do not alter market truth.">
          <div className="flex items-start gap-2">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <div className="space-y-1 text-[11px] leading-relaxed text-zinc-400">
              <p>Market evidence still determines whether a thesis is bullish, bearish, neutral, supported, or rejected.</p>
              <p>Your profile can later shape contract-fit, risk context, and behavioral comparisons inside Trader Intelligence.</p>
            </div>
          </div>
        </Panel>
      </div>
      )}
    </div>
  );
};

export default TraderProfileView;

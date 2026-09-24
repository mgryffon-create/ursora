import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Save, UserRound } from 'lucide-react';
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

export const TraderProfileView: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<TraderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
        if (active) setProfile(existing ?? EMPTY_PROFILE(user.id));
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : String(error));
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

  if (!user || !profile) {
    return (
      <Panel title="Trader profile">
        <p className="text-sm text-zinc-400">Sign in to create a persistent trader profile.</p>
      </Panel>
    );
  }

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
      setMessage('Trader profile saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Trader profile"
        title="Set your trading baseline"
        description="Tell URSORA what you are trying to do. Trader Intelligence can later compare your stated plan with your observed behavior without changing the market thesis."
        right={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-zinc-500">{completion}% complete</span>
            <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save profile
            </Button>
          </div>
        }
      />

      {message && (
        <div className="rounded-sm border border-zinc-800 bg-black/20 px-3 py-2 text-[11px] text-zinc-300">{message}</div>
      )}

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
    </div>
  );
};

export default TraderProfileView;

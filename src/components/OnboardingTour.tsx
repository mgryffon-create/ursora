import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Brain, GraduationCap, LineChart, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExperiencePath } from '@/lib/orientation';

const tradingSteps = [
  { title: 'Start with Today', body: 'Opportunities organizes current setups. Market Overview explains the broader environment. Open a ticker to review the evidence behind its analysis.', Icon: LineChart },
  { title: 'Review your trading process', body: 'Connected brokerage history, historical evidence, and trader patterns help you review your decisions alongside the available market evidence.', Icon: Brain },
  { title: 'Make MyURSORA yours', body: 'Your optional trader profile adds context about your goals, trading style, and habits. You can set it up from MyURSORA at any time.', Icon: UserRound },
  { title: 'URSORA U is here when you need it', body: 'You can open URSORA University for lessons, focused practice, and synthetic paper-trading sessions without leaving your account.', Icon: GraduationCap },
];
const learningSteps = [
  { title: 'Your home is URSORA U', body: 'Your dashboard will help you start or continue modules and see your progress through URSORA University.', Icon: GraduationCap },
  { title: 'Learn, then practice', body: 'Start with a short placement and foundation recap. Lessons connect market concepts with exercises and synthetic paper-trading assessments.', Icon: BookOpen },
  { title: 'Explore the research workspace', body: 'URSORA’s opportunities, market overview, positions, and trade evidence remain available. You can explore them and return to your learning home at any time.', Icon: LineChart },
  { title: 'Your pace, your progress', body: 'Completed module checks and your current activity are saved to your account. Learning progress does not certify that you are ready to trade with real money.', Icon: Brain },
];
const limits = { title: 'Understand the limits', body: 'URSORA is a research and learning tool. Scores summarize available evidence, not probabilities of profit. Trading and options involve the risk of loss.', Icon: ShieldCheck };

export default function OnboardingTour({ onFinish, initialPath = null }: { onFinish: (path: ExperiencePath) => Promise<void>; initialPath?: ExperiencePath | null }) {
  const [path, setPath] = useState<ExperiencePath | null>(initialPath);
  const [step, setStep] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const steps = [...(path === 'learning' ? learningSteps : tradingSteps), limits];
  const current = step ? steps[step - 1] : null;
  const final = step === steps.length;
  const finish = async () => {
    if (!path || busy) return;
    setBusy(true); setError(null);
    try { await onFinish(path); } catch { setError('Your choice could not be saved. Please try again; your orientation is still open.'); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-labelledby="orientation-title" className="my-auto max-h-[90dvh] w-full max-w-2xl overflow-auto rounded-xl border border-zinc-700 bg-[#111419] p-5 shadow-2xl sm:p-7">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sky-400">Getting started · {step + 1} of {steps.length + 1}</p>
      <h2 id="orientation-title" ref={heading} tabIndex={-1} className="mt-4 text-2xl font-semibold text-zinc-100 outline-none">{current?.title ?? 'What brings you to URSORA?'}</h2>
      {current ? <div className="mt-4 flex gap-3"><current.Icon className="mt-1 h-5 w-5 shrink-0 text-sky-300"/><p className="text-sm leading-relaxed text-zinc-300">{current.body}</p></div> : <>
        <p className="mt-2 text-sm text-zinc-400">Choose the experience you’d like to start with. Both workspaces stay available.</p>
        <fieldset className="mt-5 grid gap-3 sm:grid-cols-2"><legend className="sr-only">Choose your starting experience</legend>
          {([{ value: 'learning', title: 'URSORA U', label: 'I’m here to learn to trade', body: 'Make lessons, practice, and module progress the center of my experience.', Icon: GraduationCap }, { value: 'trading', title: 'URSORA', label: 'I’m a current trader', body: 'Start with market research, setups, and reviewing my trading process.', Icon: LineChart }] as const).map((option) => <label key={option.value} className={`cursor-pointer rounded-lg border p-4 focus-within:ring-2 focus-within:ring-sky-400 ${path === option.value ? 'border-sky-400 bg-sky-500/10' : 'border-zinc-700 bg-black/20'}`}>
            <div className="flex items-center justify-between"><option.Icon className="h-6 w-6 text-sky-300"/><input type="radio" name="experience" value={option.value} checked={path === option.value} onChange={() => setPath(option.value)}/></div>
            <div className="mt-4 text-lg font-semibold text-zinc-100">{option.title}</div><div className="mt-1 text-sm text-sky-200">{option.label}</div><p className="mt-2 text-sm leading-relaxed text-zinc-400">{option.body}</p>
          </label>)}
        </fieldset>
      </>}
      {final && <label className="mt-5 flex items-start gap-2 rounded-md border border-zinc-800 p-3 text-xs leading-relaxed text-zinc-400"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5"/><span>I understand that URSORA supports research and learning and does not guarantee investment outcomes.</span></label>}
      {error && <p role="alert" className="mt-4 text-sm text-amber-300">{error}</p>}
      <div className="mt-6 flex items-center justify-between gap-3"><button type="button" disabled={!step || busy} onClick={() => setStep((value) => value - 1)} className="min-h-11 px-2 text-sm text-zinc-400 disabled:opacity-30">Back</button><Button className="min-h-11" disabled={busy || !path || (final && !acknowledged)} onClick={() => final ? void finish() : setStep((value) => value + 1)}>{busy ? 'Saving your choice…' : final ? path === 'learning' ? 'Enter URSORA U' : 'Enter URSORA' : 'Continue'}</Button></div>
    </div>
  </div>;
}

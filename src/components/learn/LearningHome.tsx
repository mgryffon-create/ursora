import React from 'react';
import UniversityBilling from './UniversityBilling';
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, Radar } from 'lucide-react';
import type { Lesson } from '@/lib/learn/lessons';
import type { learningDashboard } from '@/lib/learn/dashboard';
import type { LearnFeature } from './UniversityModule';

type Dashboard = ReturnType<typeof learningDashboard>;
export default function LearningHome({ dashboard, lessons, onStart, onOpenFeature }: {
  dashboard: Dashboard; lessons: Lesson[]; onStart: (page: string) => void; onOpenFeature?: (feature: LearnFeature) => void;
}) {
  const target = dashboard.needsPlacement ? 'placement' : dashboard.current?.id ?? dashboard.next?.id ?? 'practice';
  const title = dashboard.needsPlacement ? 'Find your starting point' : dashboard.current ? 'Continue where you left off' : dashboard.next ? 'Your next module' : 'Keep your skills in practice';
  const nextTitle = dashboard.needsPlacement ? 'Start with a short placement and foundation recap.' : dashboard.current?.title ?? dashboard.next?.title ?? 'Full trading sandbox';
  return <div className="learn-workspace space-y-5" aria-label="Learning home">
    <section className="learn-panel space-y-4">
      <div className="flex items-center gap-2 text-sky-300"><GraduationCap className="h-5 w-5"/><span className="text-xs uppercase tracking-widest">Your learning home</span></div>
      <h1 className="text-2xl font-semibold sm:text-3xl">Welcome to URSORA University</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-zinc-300">Build your understanding, practice with synthetic markets, and connect each lesson to the evidence you see in URSORA.</p>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{dashboard.completed} of {dashboard.total} modules completed</span><span>{dashboard.percent}%</span></div>
      <progress aria-label="Module completion" value={dashboard.completed} max={Math.max(1, dashboard.total)} className="h-2 w-full accent-sky-400"/>
    </section>
    <section className="learn-panel space-y-3 border-sky-700/50">
      <p className="text-xs uppercase tracking-wider text-sky-300">{title}</p><h2 className="text-xl">{nextTitle}</h2>
      <p className="text-sm text-zinc-400">{dashboard.needsPlacement ? 'Tell us what feels familiar and try a few questions. We’ll help you choose a starting point.' : 'Open the lesson, work through its practice, and complete the understanding check or assessment.'}</p>
      <button onClick={() => onStart(target)} className="inline-flex min-h-11 items-center gap-2">{dashboard.needsPlacement ? 'Find my starting point' : dashboard.current ? 'Continue module' : dashboard.next ? 'Start next module' : 'Open practice sandbox'}<ArrowRight className="h-4 w-4"/></button>
    </section>
    <UniversityBilling/>
    <div className="grid gap-4 md:grid-cols-2">
      <section className="learn-panel space-y-3"><h2 className="flex items-center gap-2 text-lg"><BookOpen className="h-4 w-4"/>Keep learning</h2><p className="text-sm text-zinc-400">Work through the curriculum at your pace. Your completed modules stay saved to your account.</p>
        {lessons.filter((lesson) => lesson.id === dashboard.next?.id || lesson.id === dashboard.current?.id).map((lesson) => <button key={lesson.id} className="block w-full text-left" onClick={() => onStart(dashboard.needsPlacement ? 'placement' : lesson.id)}>{lesson.title}</button>)}
        <button onClick={() => onStart(dashboard.needsPlacement ? 'placement' : 'practice')}>Practice what you’ve learned</button>
        {dashboard.completed === dashboard.total && <p className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="h-4 w-4"/>All module checks completed. You can revisit any lesson.</p>}
      </section>
      <section className="learn-panel space-y-3"><h2 className="flex items-center gap-2 text-lg"><Radar className="h-4 w-4"/>Explore URSORA</h2><p className="text-sm text-zinc-400">The research workspace is available throughout your learning. Explore market context and trade evidence, then return here to continue.</p>
        <div className="flex flex-wrap gap-2"><button onClick={() => onOpenFeature?.('opportunities')}>Opportunities</button><button onClick={() => onOpenFeature?.('command')}>Market Overview</button><button onClick={() => onOpenFeature?.('trades')}>Positions & TradeCycles</button></div>
        <p className="text-xs text-zinc-500">Lessons and practice do not guarantee trading outcomes.</p>
      </section>
    </div>
  </div>;
}

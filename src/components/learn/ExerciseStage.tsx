import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type Props = { title: string; label: string; onReturn: () => void; visual: React.ReactNode; children: React.ReactNode; navigation: React.ReactNode };
// A dedicated exercise viewport keeps the evidence and current question together.
export default function ExerciseStage({ title, label, onReturn, visual, children, navigation }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    const focus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    root.current?.focus();
    return () => { document.body.style.overflow = previous; focus?.focus(); };
  }, []);
  return createPortal(<div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${title} · Exercise`} className="learn-workspace learn-exercise-stage" onKeyDown={event => {
    if (event.key === 'Escape' && !(event.target instanceof HTMLSelectElement)) { event.stopPropagation(); onReturn(); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], summary, [tabindex="0"]') ?? []).filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus(); }
  }}>
    <header className="exercise-stage-header"><button onClick={onReturn}>Return to lesson</button><div><p>{label}</p><h1>{title}</h1></div></header>
    <div className="exercise-stage-content"><section className="exercise-stage-visual" aria-label="Exercise illustration">{visual}</section><section className="exercise-stage-question" aria-label="Current exercise question">{children}</section></div>
    <footer className="exercise-stage-navigation">{navigation}</footer>
  </div>, document.body);
}

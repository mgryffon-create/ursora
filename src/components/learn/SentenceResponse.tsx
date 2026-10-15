import React, { useId } from 'react';
import { buildSentence, responseComplete, sentencePrompts, sentenceSelections, type PromptKind } from '@/lib/learn/sentence-prompts';

type Props = { kind: PromptKind; value: string; onChange: (value: string) => void; disabled?: boolean };
export default function SentenceResponse({ kind, value, onChange, disabled = false }: Props) {
  const id = useId();
  const prompt = sentencePrompts[kind];
  const selected = sentenceSelections(kind, value);
  // Recorded explanations from earlier versions remain readable and unchanged.
  if (disabled) return <div><h3 className="text-sm text-zinc-300">{prompt.legend}</h3><p className="mt-2 text-sm">{value}</p></div>;
  return <fieldset className="space-y-3">
    <legend className="text-sm text-sky-200">{prompt.legend}</legend>
    <p className="text-xs text-zinc-400">Complete each blank using what you observe. Choices help you explain a decision; they do not mark it correct.</p>
    {prompt.blanks.map((blank, index) => {
      const choice = blank.choices.find(option => option.text === selected[index]);
      return <div key={blank.prefix} className="space-y-1">
        <label className="learn-blank" htmlFor={`${id}-${index}`}>
          <span>{blank.prefix}</span>
          <select id={`${id}-${index}`} aria-describedby={choice ? `${id}-${index}-help` : undefined} value={selected[index]} onChange={event => {
            const next = [...selected]; next[index] = event.target.value; onChange(buildSentence(kind, next));
          }}>
            <option value="">Choose a phrase…</option>
            {blank.choices.map(option => <option key={option.text} value={option.text}>{option.text}</option>)}
          </select>
        </label>
        {choice && <p id={`${id}-${index}-help`} className="text-xs text-zinc-400">{choice.explanation}</p>}
      </div>;
    })}
    {responseComplete(value) && selected.every(Boolean) && <p className="text-sm text-zinc-200" aria-live="polite">Your statement: {value}</p>}
    {value && !selected.some(Boolean) && <p className="text-xs text-zinc-400">Previous draft: {value}. Choose phrases above to replace it.</p>}
  </fieldset>;
}

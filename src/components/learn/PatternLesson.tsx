import React from 'react';
import { patterns, patternBars, patternSources } from '@/lib/learn/patterns';
import { useLearnState } from './LearnProgress';
import StudyChart from './StudyChart';
export default function PatternLesson({ group }: { group: 'candle' | 'chart' }) {
 const catalog = patterns.filter(pattern=>pattern.group === group);
 const [state, setState] = useLearnState(`pattern-study:${group}`,{id:catalog[0].id,labels:true});
 const pattern = catalog.find(item=>item.id === state.id) ?? catalog[0], index = catalog.indexOf(pattern);
 const plotted = pattern.bars ? patternBars(pattern) : {};
 return <section className="space-y-4" aria-label="Pattern library">
  <p className="learn-activity-context">{group === 'candle' ? 'Read one to three closed candles, then ask what happened before them. The same shape can have a different name and meaning after a rise versus a fall.' : 'These formations span a sequence of swings. A developing shape is a possibility; the boundary can hold, break, or fail after a break.'} Bullish means an upward interpretation; bearish means a downward interpretation. Neither is a promise.</p>
  <label>Choose a {group === 'candle' ? 'candlestick' : 'chart'} pattern<select value={pattern.id} onChange={event=>setState(value=>({...value,id:event.target.value}))}>{catalog.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  <div className="flex flex-wrap items-center justify-between gap-2"><h2>{pattern.name}</h2><span>{index+1} of {catalog.length}</span></div>
  <p><strong>Where to look:</strong> {pattern.context}.</p>
  <StudyChart comparison key={pattern.id} {...plotted} points={pattern.points} title={`${pattern.name} · ${pattern.context}`} labels={state.labels}/>
  <div className="learn-pattern-notes"><div><h3>Recognize the shape</h3><p>{pattern.shape}</p></div><div><h3>What it may suggest</h3><p>{pattern.suggests}</p></div><div><h3>What still needs checking</h3><p>{pattern.boundary}</p></div></div>
  <p className="learn-coach">Read it in order: prior direction → nearby floor or ceiling → completed shape → subsequent evidence → invalidation. A floor is support; a ceiling is resistance. Volume measures activity, not the identity or intent of traders. A pattern alone does not establish a profitable entry.</p>
  <div className="flex flex-wrap justify-between gap-2"><button disabled={index===0} onClick={()=>setState(value=>({...value,id:catalog[index-1].id}))}>Previous pattern</button><button disabled={index===catalog.length-1} onClick={()=>setState(value=>({...value,id:catalog[index+1].id}))}>Next pattern</button></div>
  <details className="learn-pattern-sources"><summary>Further reading and references</summary><p>Definitions cross-checked against these guides. URSORA explanations, diagrams and exercises are independently authored. Naming conventions vary; illustrations teach recognition rather than measured win rates.</p>{patternSources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.name}</a>)}</details>
 </section>;
}

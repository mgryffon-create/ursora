import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, Send, Trash2, User } from 'lucide-react';
import db from '@/lib/db';
import { EDGE_FUNCTIONS, callEdge, track } from '@/lib/api';
import type { ChatMessage } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { DataBadge, Spinner } from '@/components/common/Primitives';
import { clockET } from '@/lib/format';
import { cn } from '@/lib/utils';

const GENERAL_CHIPS = [
  'Why is the highest-ranked opportunity first today?',
  'Which upcoming market event creates the greatest risk?',
  'What changed in TSLA investor sentiment today?',
  "Compare today's NVDA and AMD call opportunities.",
  'Which symbols did URSORA exclude from trading consideration, and why?',
  'What is the weakest evidence in the highest-ranked opportunity?',
];

const THESIS_CHIPS = [
  'What are the strongest reasons not to take this trade?',
  'What evidence would make this trade analysis no longer valid?',
  'How would this option likely be affected if the stock remains flat for three hours?',
  'Why is this contract preferred over the higher-risk alternative?',
  'Which factor had the greatest effect on this score?',
];

export const AnalystChat: React.FC<{
  symbol?: string | null;
  signalId?: number | null;
  thread?: string;
  className?: string;
  heightClass?: string;
}> = ({ symbol = null, signalId = null, thread = 'main', className, heightClass = 'h-[420px]' }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) {
        setLoaded(true);
        return;
      }
      const { data } = await db
        .from('ai_chat_messages')
        .select('*')
        .eq('thread', thread)
        .order('created_at', { ascending: true })
        .limit(100);
      if (!active) return;
      setMessages((data as ChatMessage[]) ?? []);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [user, thread]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const persist = useCallback(
    async (role: 'user' | 'assistant', content: string, contextUsed?: Record<string, unknown>) => {
      if (!user) return null;
      const { data } = await db
        .from('ai_chat_messages')
        .insert({ user_id: user.id, thread, role, content, symbol, context_used: contextUsed ?? null })
        .select('*');
      return (data as ChatMessage[])?.[0] ?? null;
    },
    [user, thread, symbol],
  );

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setError(null);
      setBusy(true);
      setInput('');
      const local: ChatMessage = {
        id: Date.now(), thread, role: 'user', content: q, context_used: null, symbol,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, local]);
      void persist('user', q);
      try {
        const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
        const res = await callEdge<{ answer: string; contextUsed: Record<string, unknown> }>(EDGE_FUNCTIONS.analyst, {
          question: q, symbol, signalId, history,
        });
        const reply: ChatMessage = {
          id: Date.now() + 1, thread, role: 'assistant', content: res.answer,
          context_used: res.contextUsed ?? null, symbol, created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, reply]);
        void persist('assistant', res.answer, res.contextUsed);
        track('ai_question_asked', { thread, symbol: symbol ?? 'none', grounded: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, persist, signalId, symbol, thread],
  );

  const clear = useCallback(async () => {
    setMessages([]);
    if (user) await db.from('ai_chat_messages').delete().eq('thread', thread).eq('user_id', user.id);
  }, [thread, user]);

  const chips = signalId ? THESIS_CHIPS : GENERAL_CHIPS;

  return (
    <div className={cn('flex min-h-0 flex-col rounded-md border border-zinc-800 bg-[#14171c]', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
            AI Analyst{symbol ? ` — ${symbol}` : ''}
          </h3>
          <DataBadge kind="derived" label="BASED ON URSORA DATA" />
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:text-red-300"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            clear
          </button>
        )}
      </header>

      <div ref={scroller} className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto p-3', heightClass)}>
        {!loaded && <Spinner label="Loading chat history" />}
        {loaded && messages.length === 0 && (
          <div className="rounded-sm border border-zinc-800 bg-black/30 p-3">
            <p className="text-[13px] leading-relaxed text-zinc-400">
              Ask about any opportunity, score rationale, option contract, market event, or risk consideration. The analyst uses only information currently available in URSORA and states when requested information is unavailable.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && <Bot className="mt-1 h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />}
            <div
              className={cn(
                'max-w-[85%] rounded-md border px-3 py-2 text-[13px] leading-relaxed animate-fade-in',
                m.role === 'user'
                  ? 'border-sky-500/30 bg-sky-500/10 text-zinc-100'
                  : 'border-zinc-800 bg-black/40 text-zinc-300',
              )}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-500">
                <span>{clockET(m.created_at)}</span>
                {m.role === 'assistant' && m.context_used ? (
                  <span className="truncate">
                    data used: {(m.context_used as { tables?: string[] }).tables?.join(', ') ?? 'stored platform data'}
                  </span>
                ) : null}
              </div>
            </div>
            {m.role === 'user' && <User className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />}
          </div>
        ))}
        {busy && <Spinner label="Reviewing available URSORA data" className="py-3" />}
        {error && (
          <div className="flex items-start gap-2 rounded-sm border border-red-500/40 bg-red-500/10 p-2 text-[12px] text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => ask(c)}
              disabled={busy}
              className="rounded-sm border border-zinc-800 bg-black/30 px-2 py-1 text-left text-[11px] text-zinc-400 transition-colors hover:border-sky-500/40 hover:text-sky-300 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <label className="sr-only" htmlFor={`analyst-input-${thread}`}>
            Ask the AI analyst a question
          </label>
          <textarea
            id={`analyst-input-${thread}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            rows={2}
            placeholder={user ? 'Ask about an opportunity, option contract, market event, or risk…' : 'Sign in to ask the analyst'}
            disabled={!user || busy}
            className="min-h-[46px] flex-1 resize-none rounded-sm border border-zinc-800 bg-black/40 px-2.5 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus-visible:border-sky-500/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500/40 disabled:opacity-60"
          />
          <Button type="submit" size="sm" disabled={!user || busy || !input.trim()} className="h-[46px] gap-1.5">
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Ask
          </Button>
        </form>
        <p className="mt-2 text-[10px] leading-snug text-zinc-600">
          Answers are based on the data currently available in URSORA. Not investment advice.
        </p>
      </div>
    </div>
  );
};

export default AnalystChat;

/**
 * URSORA — EXPLANATION LEVEL (per-user, persisted).
 *
 * PRESENTATION ONLY. This setting changes WORDING and nothing else. It must
 * never be read by a scoring, calculation, recommendation, risk or behavioural
 * classification path — those are deterministic and identical at every level.
 *
 * Persistence: user_prefs.explanation_level for a signed-in account, with a
 * local fallback so the choice survives a signed-out session and the first
 * render after sign-in.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import db from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { reportError } from '@/lib/errors';
import { DEFAULT_EXPLANATION_LEVEL, EXPLANATION_LEVELS, type ExplanationLevel } from '@/lib/glossary/terms';

const STORAGE_KEY = 'ursora.explanation_level';

const readLocal = (): ExplanationLevel => {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'PLAIN' || v === 'BALANCED' || v === 'TECHNICAL' ? v : DEFAULT_EXPLANATION_LEVEL;
  } catch {
    return DEFAULT_EXPLANATION_LEVEL;
  }
};

interface ExplanationContextValue {
  level: ExplanationLevel;
  levels: typeof EXPLANATION_LEVELS;
  setLevel: (next: ExplanationLevel) => void;
  saving: boolean;
  error: string | null;
}

const Ctx = createContext<ExplanationContextValue | null>(null);

export const useExplanation = (): ExplanationContextValue => {
  const ctx = useContext(Ctx);
  // A missing provider must never crash a screen: fall back to the default.
  if (!ctx) {
    return {
      level: DEFAULT_EXPLANATION_LEVEL,
      levels: EXPLANATION_LEVELS,
      setLevel: () => undefined,
      saving: false,
      error: null,
    };
  }
  return ctx;
};

export const ExplanationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [level, setLevelState] = useState<ExplanationLevel>(readLocal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the stored preference for the signed-in account.
  useEffect(() => {
    let active = true;
    if (!user) return undefined;
    void (async () => {
      const { data, error: e } = await db
        .from('user_prefs')
        .select('explanation_level')
        .eq('user_id', user.id)
        .limit(1);
      if (!active) return;
      if (e) {
        // Not fatal: the default level is a perfectly usable state.
        reportError('explanation-level:load', e);
        return;
      }
      const stored = (data as { explanation_level?: string }[] | null)?.[0]?.explanation_level;
      if (stored === 'PLAIN' || stored === 'BALANCED' || stored === 'TECHNICAL') {
        setLevelState(stored);
        try { window.localStorage.setItem(STORAGE_KEY, stored); } catch { /* private mode */ }
      }
    })();
    return () => { active = false; };
  }, [user]);

  const setLevel = useCallback(
    (next: ExplanationLevel) => {
      setLevelState(next);
      setError(null);
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
      if (!user) return;
      setSaving(true);
      void (async () => {
        const { error: e } = await db
          .from('user_prefs')
          .update({ explanation_level: next, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        if (e) setError(reportError('explanation-level:save', e, 'Your explanation level could not be saved.'));
        setSaving(false);
      })();
    },
    [user],
  );

  const value = useMemo<ExplanationContextValue>(
    () => ({ level, levels: EXPLANATION_LEVELS, setLevel, saving, error }),
    [level, setLevel, saving, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export default ExplanationProvider;

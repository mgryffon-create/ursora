import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import db from '@/lib/db';

export interface UserPrefs {
  user_id?: string;
  display_name: string | null;
  alert_min_score: number;
  alert_directions: string[];
  alert_risk_max: string;
  alert_email: boolean;
  auto_paper_trade: boolean;
}

const DEFAULT_PREFS: UserPrefs = {
  display_name: null,
  alert_min_score: 70,
  alert_directions: ['bullish', 'bearish'],
  alert_risk_max: 'High',
  alert_email: false,
  auto_paper_trade: false,
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  watchlist: string[];
  favorites: string[];
  prefs: UserPrefs;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  addToWatchlist: (symbol: string) => Promise<void>;
  removeFromWatchlist: (symbol: string) => Promise<void>;
  addFavorite: (symbol: string) => Promise<void>;
  removeFavorite: (symbol: string) => Promise<void>;
  toggleFavorite: (symbol: string) => Promise<void>;
  savePrefs: (patch: Partial<UserPrefs>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

export const DEFAULT_UNIVERSE = [
  'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL',
  'AMD', 'NFLX', 'COIN', 'PLTR', 'SPY', 'QQQ', 'IWM',
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_UNIVERSE);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);

  const loadUserData = useCallback(async (uid: string | null) => {
    if (!uid) {
      setWatchlist(DEFAULT_UNIVERSE);
      setFavorites([]);
      setPrefs(DEFAULT_PREFS);
      return;
    }
    const [wl, fav, pf] = await Promise.all([
      db.from('watchlists').select('symbol').order('added_at', { ascending: true }),
      db.from('user_favorites').select('symbol').eq('user_id', uid).order('added_at', { ascending: true }),
      db.from('user_prefs').select('*').eq('user_id', uid).limit(1),
    ]);
    const symbols = ((wl.data as { symbol: string }[] | null) ?? []).map((r) => r.symbol);
    if (symbols.length === 0) {
      // First login: seed the prioritised default universe for this user.
      const seeded = DEFAULT_UNIVERSE.map((symbol) => ({ user_id: uid, symbol }));
      const { error } = await db.from('watchlists').insert(seeded);
      setWatchlist(error ? DEFAULT_UNIVERSE : DEFAULT_UNIVERSE);
    } else {
      setWatchlist(symbols);
    }
    setFavorites(
      ((fav.data as { symbol: string }[] | null) ?? [])
        .map((row) => String(row.symbol).toUpperCase())
        .filter(Boolean),
    );

    const existing = (pf.data as UserPrefs[] | null)?.[0];
    if (existing) {
      setPrefs({ ...DEFAULT_PREFS, ...existing });
    } else {
      await db.from('user_prefs').insert({ user_id: uid, ...DEFAULT_PREFS });
      setPrefs(DEFAULT_PREFS);
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await db.auth.getSession();
      if (!active) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      await loadUserData(data.session?.user?.id ?? null);
      if (active) setLoading(false);
    })();

    const { data: sub } = db.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
      setUser(next?.user ?? null);
      void loadUserData(next?.user?.id ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadUserData]);

  const signIn = useCallback(async (email: string, password: string, remember = true) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ursora_remember_login', remember ? 'true' : 'false');
    }

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    // Record the new trader in the owner's CRM (upsert by email, consent-aware).
    try {
      await db.rpc('crm_submit_contact', {
        p_email: email,
        p_name: null,
        p_phone: null,
        p_sms_opt_in: false,
        p_source: 'ursora-signup',
        p_metadata: { product: 'URSORA', plan: 'research' },

      });
    } catch {
      /* never block account creation on CRM capture */
    }
    if (!data.session) {
      const retry = await db.auth.signInWithPassword({ email, password });
      if (!retry.error) return { needsConfirmation: false };
      return { needsConfirmation: true };
    }
    return { needsConfirmation: false };
  }, []);

  const signOut = useCallback(async () => {
    if (typeof window !== 'undefined') {
      if (user?.id) window.sessionStorage.removeItem(`ursora_login_market_refresh_${user.id}`);
    }
    await db.auth.signOut();
    setWatchlist(DEFAULT_UNIVERSE);
    setFavorites([]);
    setPrefs(DEFAULT_PREFS);
  }, [user]);

  const addToWatchlist = useCallback(
    async (symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (!sym || !user) return;
      const { error } = await db.from('watchlists').insert({ user_id: user.id, symbol: sym });
      if (error && !`${error.message}`.includes('duplicate')) throw new Error(error.message);
      setWatchlist((prev) => (prev.includes(sym) ? prev : [...prev, sym]));
    },
    [user],
  );

  const removeFromWatchlist = useCallback(
    async (symbol: string) => {
      if (!user) return;
      const { error } = await db.from('watchlists').delete().eq('symbol', symbol).eq('user_id', user.id);
      if (error) throw new Error(error.message);
      setWatchlist((prev) => prev.filter((s) => s !== symbol));
    },
    [user],
  );

  const addFavorite = useCallback(
    async (symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (!sym || !user) return;
      const { error } = await db.from('user_favorites').upsert(
        { user_id: user.id, symbol: sym },
        { onConflict: 'user_id,symbol', ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
      setFavorites((prev) => (prev.includes(sym) ? prev : [...prev, sym]));
    },
    [user],
  );

  const removeFavorite = useCallback(
    async (symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (!sym || !user) return;
      const { error } = await db
        .from('user_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('symbol', sym);
      if (error) throw new Error(error.message);
      setFavorites((prev) => prev.filter((item) => item !== sym));
    },
    [user],
  );

  const toggleFavorite = useCallback(
    async (symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (!sym || !user) return;
      if (favorites.includes(sym)) await removeFavorite(sym);
      else await addFavorite(sym);
    },
    [user, favorites, addFavorite, removeFavorite],
  );

  const savePrefs = useCallback(
    async (patch: Partial<UserPrefs>) => {
      const next = { ...prefs, ...patch };
      setPrefs(next);
      if (!user) return;
      const { error } = await db
        .from('user_prefs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);
    },
    [prefs, user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user, session, loading, watchlist, favorites, prefs,
      signIn, signUp, signOut, addToWatchlist, removeFromWatchlist, addFavorite, removeFavorite, toggleFavorite, savePrefs,
    }),
    [user, session, loading, watchlist, favorites, prefs, signIn, signUp, signOut, addToWatchlist, removeFromWatchlist, addFavorite, removeFavorite, toggleFavorite, savePrefs],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

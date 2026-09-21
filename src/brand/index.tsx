/**
 * URSORA — BRAND ASSET MODULE (single source of truth).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TODO — DROP-IN POINT FOR THE SUPPLIED ARTWORK
 * The canonical bear/bull emblem has NOT been supplied yet. Nothing in this
 * module draws, generates or invents a logo: every slot currently renders a
 * clean typographic URSORA wordmark placeholder.
 *
 * When the artwork arrives, save it as LOCAL STATIC FILES and switch the slot:
 *   public/brand/ursora-lockup-full.svg      → BRAND_ASSETS.fullLockup
 *   public/brand/ursora-lockup-standard.svg  → BRAND_ASSETS.standardLockup
 *   public/brand/ursora-mark.svg             → BRAND_ASSETS.compactMark
 *   public/brand/ursora-app-icon-1024.png    → BRAND_ASSETS.appIcon (1024×1024, iOS)
 *   public/brand/favicon.svg                  → index.html <link rel="icon">
 * Set the matching entry in BRAND_ASSETS to the path, and each component below
 * renders the file instead of the placeholder — no other file needs to change.
 *
 * RULE: brand assets are always local files under /brand/. Never reference an
 * externally hosted image URL for a brand asset.
 * ────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { cn } from '@/lib/utils';

export const BRAND = {
  name: 'URSORA',
  /** Used in prose where a sentence reads better in mixed case. */
  nameProse: 'URSORA',
  tagline: 'MARKET INTELLIGENCE | TRADECYCLE INSIGHTS',
  promise: 'A MORE COMPLETE PICTURE. A MORE DISCIPLINED YOU.',
  descriptor: 'Market, Trade and TradeCycle Intelligence',
  description:
    'URSORA is an options intelligence platform built around the TradeCycle methodology. It ranks evidence-based opportunities, tracks thesis confirmation and deviation after entry, and analyzes observable trader behavior across the full lifecycle of a trade.',
  /** Short form for toasts, notifications and system copy. */
  systemPrefix: 'URSORA',
  /** Reverse-DNS bundle identifier reserved for the iOS wrap. */
  bundleId: 'com.ursora.app',
  supportSlot: '[add your support email address]',
  legalEntitySlot: '[add your legal entity name]',
} as const;

/**
 * Asset slots. `null` means "no supplied artwork yet — render the typographic
 * placeholder". Replace a null with a path under /brand/ to go live.
 */
export const BRAND_ASSETS: {
  fullLockup: string | null;
  standardLockup: string | null;
  compactMark: string | null;
  appIcon: string | null;
} = {
  fullLockup: '/brand/ursora-lockup-full.png',
  standardLockup: '/brand/ursora-lockup-standard.png',
  compactMark: '/brand/ursora-mark.png',
  appIcon: '/brand/ursora-app-icon-1024.png',
};

/* -------------------------------------------------------------------------- */
/*  Typographic placeholder primitives                                        */
/* -------------------------------------------------------------------------- */

const Wordmark: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn('font-mono font-semibold uppercase tracking-[0.28em] text-zinc-100', className)}>
    {BRAND.name}
  </span>
);

/**
 * COMPACT MARK — emblem only. Mobile nav, favicon, dense chrome.
 * Placeholder: the initial in a square rule. Replaced wholesale by the emblem.
 */
export const CompactMark: React.FC<{ className?: string; title?: string }> = ({ className, title }) => {
  if (BRAND_ASSETS.compactMark) {
    return <img src={BRAND_ASSETS.compactMark} alt={title ?? `${BRAND.name} mark`} className={cn('h-6 w-6 object-contain', className)} />;
  }
  return (
    <span
      role="img"
      aria-label={title ?? `${BRAND.name} mark`}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-sky-500/50 bg-sky-500/10',
        'font-mono text-[12px] font-bold leading-none text-sky-300',
        className,
      )}
    >
      U
    </span>
  );
};

/**
 * STANDARD LOCKUP — emblem + URSORA. The default header/footer lockup.
 */
export const StandardLockup: React.FC<{ className?: string; markClassName?: string; textClassName?: string }> = ({
  className, markClassName, textClassName,
}) => {
  if (BRAND_ASSETS.standardLockup) {
    return <img src={BRAND_ASSETS.standardLockup} alt={BRAND.name} className={cn('h-8 w-auto object-contain', className)} />;
  }
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <CompactMark className={cn('h-5 w-5 text-[11px]', markClassName)} />
      <Wordmark className={cn('text-[13px]', textClassName)} />
    </span>
  );
};

/**
 * FULL LOCKUP — emblem + URSORA + tagline. Landing hero, auth panel, reports.
 */
export const FullLockup: React.FC<{ className?: string; align?: 'left' | 'center' }> = ({ className, align = 'left' }) => {
  if (BRAND_ASSETS.fullLockup) {
    return <img src={BRAND_ASSETS.fullLockup} alt={`${BRAND.name} — ${BRAND.tagline}`} className={cn('h-16 w-auto object-contain', className)} />;
  }
  return (
    <span className={cn('inline-flex flex-col gap-1.5', align === 'center' && 'items-center text-center', className)}>
      <span className="inline-flex items-center gap-2.5">
        <CompactMark className="h-8 w-8 text-[16px]" />
        <Wordmark className="text-2xl sm:text-3xl" />
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-sky-400/80 sm:text-[10px]" style={{ textWrap: 'balance' }}>
        {BRAND.tagline}
      </span>
    </span>
  );
};

/**
 * APP ICON — emblem only, square, used for the 1024×1024 iOS icon preview and
 * anywhere a square avatar of the brand is needed.
 */
export const AppIcon: React.FC<{ size?: number; className?: string }> = ({ size = 64, className }) => {
  if (BRAND_ASSETS.appIcon) {
    return (
      <img
        src={BRAND_ASSETS.appIcon}
        alt={`${BRAND.name} app icon`}
        width={size}
        height={size}
        className={cn('rounded-[22%]', className)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={`${BRAND.name} app icon placeholder`}
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[22%] border border-sky-500/40 bg-gradient-to-br from-[#12161c] to-[#0b0d10]',
        className,
      )}
    >
      <span className="font-mono font-bold uppercase tracking-[0.12em] text-sky-300" style={{ fontSize: size * 0.34 }}>
        U
      </span>
    </span>
  );
};

/** One-line legal/disclosure string reused by the footer, reports and exports. */
export const DISCLOSURE =
  `${BRAND.name} is a research tool. Nothing in it is investment advice, a recommendation, or an offer to trade. ` +
  'Opportunity, Confidence, Risk, Thesis Health, Behavioural Risk and Process Adherence are internal evidence and ' +
  'process measures — none of them is a probability of profit. Options trading can result in the total loss of premium.';

export default BRAND;

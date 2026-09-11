import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { posterUrl, logoUrl } from '../data/config';
import type { WatchProviderInfo } from '../data/types';
import { IconChevronL, IconStar, IconX } from './icons';

// ---------- Poster ----------
export function Poster({ path, title, className = '', size = 'w342' as const, eager = false }: { path?: string | null; title: string; className?: string; size?: 'w92' | 'w154' | 'w185' | 'w342' | 'w500'; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = posterUrl(path, size);
  return (
    <div className={`poster ${className}`}>
      {url && !failed ? (
        <img src={url} alt={title} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className="poster-fallback">{title}</div>
      )}
    </div>
  );
}

export function PosterLink({ to, path, title, sub, size }: { to: string; path?: string | null; title: string; sub?: string; size?: 'w154' | 'w185' | 'w342' }) {
  return (
    <Link to={to} className="shelf-item">
      <Poster path={path} title={title} size={size ?? 'w342'} />
      <div className="poster-title">{title}</div>
      {sub && <div className="poster-sub">{sub}</div>}
    </Link>
  );
}

// ---------- Stars ----------
export function Stars({ value, onChange, size, readOnly }: { value?: number; onChange?: (v: number | undefined) => void; size?: 'sm' | 'md' | 'lg'; readOnly?: boolean }) {
  const cls = `stars ${size === 'lg' ? 'lg' : ''} ${size === 'sm' ? 'stars-sm' : ''}`;
  const handle = (star: number, half: boolean) => {
    if (!onChange) return;
    const v = half ? star - 0.5 : star;
    onChange(value === v ? undefined : v);
  };
  return (
    <div className={cls} role={readOnly ? 'img' : 'radiogroup'} aria-label={readOnly ? `Rated ${value ?? 0} of 5` : 'Rate'}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = value !== undefined && value >= star ? 'full' : value !== undefined && value >= star - 0.5 ? 'half' : 'none';
        const inner = fill === 'full'
          ? <IconStar fill="currentColor" />
          : fill === 'half'
            ? <span style={{ position: 'relative', display: 'inline-flex' }}><IconStar /><span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: '50%' }}><IconStar fill="currentColor" /></span></span>
            : <IconStar />;
        if (readOnly || !onChange) return <span key={star} className={`star-fill ${fill !== 'none' ? 'lit' : ''}`} style={{ display: 'inline-flex', padding: '0 2px' }}>{inner}</span>;
        return (
          <button key={star} type="button" aria-label={`${star} stars`}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); handle(star, e.clientX - r.left < r.width / 2); }}
            onKeyDown={(e) => { if (e.key === 'ArrowLeft') handle(star, true); if (e.key === 'ArrowRight') handle(star, false); }}>
            <span className={`star-fill ${fill !== 'none' ? 'lit' : ''}`}>{inner}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Sheet ----------
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className={`sheet-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`sheet ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        {title && <div className="sheet-title">{title}</div>}
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

// ---------- Segmented ----------
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

// ---------- Chips ----------
export function Chip({ label, on, onClick }: { label: string; on?: boolean; onClick?: () => void }) {
  return <button className={`chip ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>{label}</button>;
}

// ---------- Slider ----------
export function LabeledSlider({ left, right, value, onChange, label }: { left: string; right: string; value: number; onChange: (v: number) => void; label?: string }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <input type="range" className="slider" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} aria-label={label ?? `${left} to ${right}`} />
      <div className="slider-labels"><span>{left}</span><span>{right}</span></div>
    </div>
  );
}

// ---------- Toasts ----------
interface Toast { id: number; text: string }
const ToastCtx = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const push = useCallback((text: string) => {
    const now = Date.now();
    // collapse duplicate bursts of the same toast (e.g. double-tap)
    if (lastRef.current.text === text && now - lastRef.current.at < 1200) return;
    lastRef.current = { text, at: now };
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-1), { id, text }]); // keep at most 2, single-line feed
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-feed" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Top bar ----------
export function TopBar({ title, right, back }: { title: string; right?: React.ReactNode; back?: boolean }) {
  const nav = useNavigate();
  return (
    <div className="topbar">
      <div className="topbar-row">
        <div className="row">
          {back && <button className="iconbtn plain" onClick={() => nav(-1)} aria-label="Back"><IconChevronL /></button>}
          <div className="large-title">{title}</div>
        </div>
        <div className="row">{right}</div>
      </div>
    </div>
  );
}

// ---------- Skeleton ----------
export const SkeletonShelf = () => (
  <div className="shelf">{[0, 1, 2, 3].map((i) => <div key={i} className="shelf-item"><div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 10 }} /><div className="skeleton" style={{ height: 12, marginTop: 7, width: '70%' }} /></div>)}</div>
);

// ---------- Empty state ----------
export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {body && <div className="footnote">{body}</div>}
      {action && <div className="mt16">{action}</div>}
    </div>
  );
}

// ---------- Provider logos ----------
export function ProviderLogos({ providers, max = 5 }: { providers?: WatchProviderInfo[]; max?: number }) {
  if (!providers?.length) return null;
  return (
    <div className="row wrap">
      {providers.slice(0, max).map((p) => (
        <img key={p.id} className="provider-logo" src={logoUrl(p.logoPath, 'w92') ?? ''} alt={p.name} title={p.name} loading="lazy" />
      ))}
      {providers.length > max && <span className="footnote">+{providers.length - max}</span>}
    </div>
  );
}

// ---------- Confirm dialog ----------
export function ConfirmSheet({ open, onClose, onConfirm, title, body, confirmLabel, destructive }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: string; confirmLabel: string; destructive?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {body && <p className="subhead center" style={{ marginBottom: 18 }}>{body}</p>}
      <button className={`btn btn-block ${destructive ? 'btn-destructive' : 'btn-primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      <button className="btn btn-block btn-ghost mt8" onClick={onClose}>Cancel</button>
    </Sheet>
  );
}

export const closeBtn = (onClose: () => void) => (
  <button className="iconbtn plain" onClick={onClose} aria-label="Close"><IconX /></button>
);

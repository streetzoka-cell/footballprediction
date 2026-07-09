// src/styles/common.js
import { useEffect, useRef, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════
   TIMING CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_DEFAULT = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const FAST = '0.2s';
export const NORMAL = '0.3s';
export const SLOW = '0.5s';
export const SLUGGISH = '0.6s';
export const LETHARGIC = '0.8s';

/* ═══════════════════════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════════════════════ */

export const useInView = (opts = { threshold: 0.1 }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      opts
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [opts]);

  return [ref, visible];
};

/* ═══════════════════════════════════════════════════════════════
   ANIMATION FACTORIES
   ═══════════════════════════════════════════════════════════════ */

export const fadeUp = (vis, del = 0, dur = SLUGGISH) => ({
  opacity: vis ? 1 : 0,
  transform: vis ? 'translateY(0)' : 'translateY(24px)',
  transition: `opacity ${dur} ${EASE_OUT} ${del}ms, transform ${dur} ${EASE_OUT} ${del}ms`,
});

export const fadeIn = (vis, del = 0, dur = SLOW) => ({
  opacity: vis ? 1 : 0,
  transition: `opacity ${dur} ${EASE_OUT} ${del}ms`,
});

export const scaleIn = (vis, del = 0, dur = NORMAL) => ({
  opacity: vis ? 1 : 0,
  transform: vis ? 'scale(1)' : 'scale(0.95)',
  transition: `opacity ${dur} ${EASE_OUT} ${del}ms, transform ${dur} ${EASE_OUT} ${del}ms`,
});

export const slideInLeft = (vis, del = 0, dur = NORMAL) => ({
  opacity: vis ? 1 : 0,
  transform: vis ? 'translateX(0)' : 'translateX(-12px)',
  transition: `opacity ${dur} ease ${del}ms, transform ${dur} ease ${del}ms`,
});

/* ═══════════════════════════════════════════════════════════════
   BASE PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */

export const DOT = {
  width: 4,
  height: 4,
  borderRadius: '50%',
  background: 'var(--text-muted)',
  display: 'inline-block',
};

export const dotColored = (color, size = 6) => ({
  width: size,
  height: size,
  borderRadius: '50%',
  background: color,
  display: 'inline-block',
});

export const STRONG = { color: 'var(--text-primary)', fontWeight: 600 };

export const CODE_TAG = {
  color: 'var(--accent)',
  background: 'var(--accent-glow)',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: '0.8rem',
};

/* ═══════════════════════════════════════════════════════════════
   LAYOUT
   ═══════════════════════════════════════════════════════════════ */

export const FLEX_ROW = (gap = 16, align = 'center') => ({
  display: 'flex',
  alignItems: align,
  gap,
});

export const META_ROW = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  justifyContent: 'space-between',
  marginBottom: 20,
  flexWrap: 'wrap',
};

export const META_ITEM = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: '0.78rem',
  color: 'var(--text-muted)',
};

export const GRID_STATS = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 10,
  marginBottom: 28,
};

export const GRID_CARDS = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  gap: 20,
};

export const GRID_LINKS = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
  gap: 16,
};

/* ═══════════════════════════════════════════════════════════════
   INFO BOXES
   ═══════════════════════════════════════════════════════════════ */

export const infoBox = {
  padding: '16px 20px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
};

export const infoIcon = (bg, color) => ({
  width: 36,
  height: 36,
  borderRadius: 8,
  background: bg,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color,
  flexShrink: 0,
});

export const INFO_TEXT = {
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
  margin: 0,
  lineHeight: 1.5,
};

/* ═══════════════════════════════════════════════════════════════
   SEARCH
   ═══════════════════════════════════════════════════════════════ */

export const searchIcon = (focused) => ({
  position: 'absolute',
  left: 14,
  top: '50%',
  transform: 'translateY(-50%)',
  color: focused ? 'var(--accent)' : 'var(--text-muted)',
  transition: `color ${FAST}`,
});

export const searchInput = (focused) => ({
  paddingLeft: 42,
  borderColor: focused ? 'var(--accent)' : 'var(--border)',
  boxShadow: focused ? '0 0 0 3px var(--accent-glow)' : 'none',
  transition: `border-color ${FAST}, box-shadow ${FAST}`,
  height: '100%',
});

export const clearBtn = (hov) => ({
  position: 'absolute',
  right: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  background: hov ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
  border: 'none',
  borderRadius: '50%',
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: hov ? '#fff' : 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: '0.7rem',
  fontWeight: 700,
  transition: `background ${FAST}, color ${FAST}`,
});

/* ═══════════════════════════════════════════════════════════════
   FILTERS & TABS
   ═══════════════════════════════════════════════════════════════ */

export const filterLabel = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
};

export const FILTER_TEXT = {
  fontSize: '0.78rem',
  color: 'var(--text-muted)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export const tabBadge = (active) => ({
  marginLeft: 6,
  fontSize: '0.68rem',
  fontWeight: 700,
  padding: '1px 6px',
  borderRadius: 8,
  background: active ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.06)',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
});

export const dimmed = (t) => ({
  opacity: t ? 0.4 : 1,
  transition: 'opacity 0.15s ease',
});

export const contentTransition = (exiting) => ({
  opacity: exiting ? 0 : 1,
  transform: exiting ? 'translateY(10px)' : 'translateY(0)',
  transition: `opacity ${NORMAL} ${EASE_OUT} 0.05s, transform ${NORMAL} ${EASE_OUT} 0.05s`,
});

export const clearFiltersBtn = (hov) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 14px',
  borderRadius: 20,
  background: hov ? 'rgba(239,68,68,0.2)' : 'var(--danger-dim)',
  border: '1px solid rgba(239,68,68,0.2)',
  color: 'var(--danger)',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: `background ${FAST}`,
});

/* ═══════════════════════════════════════════════════════════════
   SECTION HEADERS
   ═══════════════════════════════════════════════════════════════ */

export const sectionHead = (vis, del = 0) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 20,
  flexWrap: 'wrap',
  gap: 8,
  ...fadeUp(vis, del),
});

export const sectionIcon = (color) => ({
  width: 32,
  height: 32,
  borderRadius: 8,
  background: `${color}15`,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color,
});

export const SECTION_COUNT = {
  fontSize: '0.82rem',
  color: 'var(--text-muted)',
  fontWeight: 500,
  padding: '2px 10px',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 10,
};

/* ═══════════════════════════════════════════════════════════════
   STAT PILLS
   ═══════════════════════════════════════════════════════════════ */

export const pillContainer = (vis, del = 0) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  ...fadeUp(vis, del, SLOW),
});

export const pillIcon = (color) => ({
  width: 32,
  height: 32,
  borderRadius: 8,
  background: `${color}15`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color,
  flexShrink: 0,
});

export const PILL_VALUE = {
  fontFamily: 'var(--font-display)',
  fontSize: '1rem',
  fontWeight: 700,
  lineHeight: 1,
};

export const PILL_LABEL = {
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

/* ═══════════════════════════════════════════════════════════════
   CARD BASE
   ═══════════════════════════════════════════════════════════════ */

export const cardBase = (hov, color = 'var(--accent)') => ({
  background: hov ? 'var(--bg-card-hover)' : 'var(--bg-card)',
  border: `1px solid ${hov ? 'var(--border-light)' : 'var(--border)'}`,
  borderRadius: 'var(--radius)',
  transition: `all ${NORMAL} ${EASE_OUT}`,
  transform: hov ? 'translateY(-4px)' : 'translateY(0)',
  boxShadow: hov ? 'var(--shadow-card)' : 'none',
});

export const cardAccent = (color, hov) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
  opacity: hov ? 0.6 : 0,
  transition: `opacity ${NORMAL}`,
});

export const cardGlow = (color, hov) => ({
  position: 'absolute',
  top: '-40%',
  right: '-20%',
  width: '60%',
  height: '120%',
  background: `radial-gradient(ellipse, ${color}08 0%, transparent 70%)`,
  pointerEvents: 'none',
  opacity: hov ? 1 : 0,
  transition: `opacity ${SLOW}`,
});

export const cardIconBox = (color, hov) => ({
  width: 48,
  height: 48,
  borderRadius: 12,
  background: `${color}${hov ? '25' : '12'}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color,
  flexShrink: 0,
  transition: `background ${NORMAL}, transform ${NORMAL}`,
  transform: hov ? 'scale(1.05)' : 'scale(1)',
});

export const cardArrow = (hov) => ({
  color: 'var(--text-muted)',
  flexShrink: 0,
  marginTop: 4,
  transition: `color ${FAST}, transform ${NORMAL}`,
  transform: hov ? 'translateX(3px)' : 'translateX(0)',
  opacity: hov ? 1 : 0.4,
});

/* ═══════════════════════════════════════════════════════════════
   ACCURACY BAR
   ═══════════════════════════════════════════════════════════════ */

export const barColors = (value) => {
  if (value >= 75) return { fill: 'var(--accent)', bg: 'rgba(0,230,118,0.12)' };
  if (value >= 60) return { fill: 'var(--gold)', bg: 'rgba(245,197,66,0.12)' };
  if (value >= 45) return { fill: '#f97316', bg: 'rgba(249,115,22,0.12)' };
  return { fill: 'var(--danger)', bg: 'rgba(239,68,68,0.12)' };
};

export const BAR_WRAP = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

export const BAR_TRACK = {
  flex: 1,
  height: 5,
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 3,
  overflow: 'hidden',
};

export const barFill = (w, max, color) => ({
  height: '100%',
  width: `${(w / max) * 100}%`,
  background: color,
  borderRadius: 3,
  transition: `width ${LETHARGIC} ${EASE_OUT}`,
  boxShadow: `0 0 6px ${color}40`,
});

export const barText = (color) => ({
  fontSize: '0.78rem',
  fontWeight: 700,
  color,
  width: 42,
  textAlign: 'right',
});
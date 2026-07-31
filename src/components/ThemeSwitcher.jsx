import React, { useState, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';

const THEMES = [
  { key: 'emerald', color: '#10b981', label: 'Emerald' },
  { key: 'sapphire', color: '#3b82f6', label: 'Sapphire' },
  { key: 'amethyst', color: '#8b5cf6', label: 'Amethyst' },
];

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('zk_theme') || 'emerald');

  useEffect(() => {
    // Apply the theme to the HTML tag
    if (theme === 'emerald') {
      document.documentElement.removeAttribute('data-accent');
    } else {
      document.documentElement.setAttribute('data-accent', theme);
    }
    localStorage.setItem('zk_theme', theme);
  }, [theme]);

  return (
    <div className="theme-switcher-wrap" style={{ position: 'relative', flexShrink: 0 }}>
      <button className="nv-action-btn" onClick={() => setOpen(!open)} title="App Themes & Colors">
        <Palette size={18} strokeWidth={2.5} />
      </button>
      {open && (
        <>
          <div className="theme-switcher-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div className="theme-switcher-popover">
            <div className="tsp-header">
              <span>App Themes</span>
            </div>
            <div className="tsp-accents">
              {THEMES.map(t => (
                <button 
                  key={t.key} 
                  className={`tsp-accent ${theme === t.key ? 'on' : ''}`} 
                  onClick={() => { setTheme(t.key); setOpen(false); }}
                >
                  <span className="tsp-swatch" style={{ background: t.color, boxShadow: `0 0 10px ${t.color}` }} />
                  <span className="tsp-label">{t.label}</span>
                  {theme === t.key && <Check size={14} className="tsp-check" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
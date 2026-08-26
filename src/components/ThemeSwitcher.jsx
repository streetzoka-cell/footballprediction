import { useState, useRef, useEffect } from "react";

const THEMES = [
  { key: "midnight", label: "Midnight", icon: "🌌", desc: "Deep glass — main" },
  { key: "dark", label: "Dark", icon: "🌙", desc: "Classic dark" },
  { key: "light", label: "Light", icon: "☀️", desc: "Clean light" },
  { key: "neon", label: "Neon", icon: "💜", desc: "Purple pop" },
];

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("midnight");
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null);

  // Init — midnight as main
  useEffect(() => {
    const saved = localStorage.getItem("zokascore-theme") || "midnight";
    setCurrent(saved);
    document.documentElement.setAttribute("data-theme", saved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = saved === "light"? "#f8fafc" : "#05070a";
  }, []);

  // Close on outside click — fixed to wrapper (not just popover)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapperRef.current &&!wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const apply = (key) => {
    document.documentElement.setAttribute("data-theme", key);
    localStorage.setItem("zokascore-theme", key);
    setCurrent(key);
    setOpen(false);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = key === "light"? "#f8fafc" : "#05070a";
    // Haptic feel on mobile
    if (navigator.vibrate) navigator.vibrate(10);
  };

  return (
    <div className="theme-switcher-wrapper" ref={wrapperRef}>
      <button
        className="theme-switcher-trigger"
        onClick={() => setOpen((p) =>!p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch colour theme"
        type="button"
        style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--bg-card)',
          backdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid var(--border)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.12)',
          transition: 'all 0.22s cubic-bezier(0.22,1,0.36,1)'
        }}
      >
        <span style={{fontSize: 18, filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.22))'}}>
          {THEMES.find((t) => t.key === current)?.icon || "🌌"}
        </span>
      </button>

      {open && (
        <div ref={popoverRef} className="theme-switcher-popover" role="listbox" aria-label="Available themes">
          {THEMES.map((t) => (
            <button
              key={t.key}
              className={`theme-switcher-option${t.key === current? " theme-switcher-option--active" : ""}`}
              onClick={() => apply(t.key)}
              role="option"
              aria-selected={t.key === current}
              type="button"
            >
              <span className="theme-switcher-option-icon" style={{fontSize: 16, width: 24, textAlign: 'center'}}>{t.icon}</span>
              <span className="theme-switcher-option-label" style={{display:'flex', flexDirection:'column', alignItems:'flex-start'}}>
                <span style={{fontWeight: 800, fontSize: 13}}>{t.label}</span>
                <span style={{fontWeight: 600, fontSize: 10, opacity: 0.6}}>{t.desc}</span>
              </span>
              {t.key === current && (
                <span style={{
                  marginLeft: 'auto',
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--primary)',
                  boxShadow: '0 0 8px var(--primary)',
                  animation: 'zk-pulse 1.5s infinite'
                }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
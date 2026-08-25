import { useState, useRef, useEffect } from "react";


const THEMES = [
  { key: "dark", label: "Dark", icon: "🌙" },
  { key: "light", label: "Light", icon: "☀️" },
  { key: "midnight", label: "Midnight", icon: "🌌" },
  { key: "neon", label: "Neon", icon: "💜" },
];

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const applyTheme = (key) => {
    document.documentElement.setAttribute("data-theme", key);
    localStorage.setItem("zokascore-theme", key);
    setOpen(false);
  };

  const current = document.documentElement.getAttribute("data-theme") || "dark";

  return (
    <div className="theme-switcher-wrapper">
      <button
        className="theme-switcher-trigger"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch colour theme"
        type="button"
      >
        {THEMES.find((t) => t.key === current)?.icon || "🎨"}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="theme-switcher-popover"
          role="listbox"
          aria-label="Available themes"
        >
          {THEMES.map((t) => (
            <button
              key={t.key}
              className={`theme-switcher-option${t.key === current ? " theme-switcher-option--active" : ""}`}
              onClick={() => applyTheme(t.key)}
              role="option"
              aria-selected={t.key === current}
              type="button"
            >
              <span className="theme-switcher-option-icon">{t.icon}</span>
              <span className="theme-switcher-option-label">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

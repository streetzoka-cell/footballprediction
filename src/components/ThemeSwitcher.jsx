import { useState, useEffect, useRef } from "react";
import { Palette, Check, Moon, Sun, Sparkles, Monitor } from "lucide-react";

const THEMES = [
  { key: "dark", label: "Dark", icon: Moon, color: "#0a0d14" },
  { key: "light", label: "Light", icon: Sun, color: "#f8fafc" },
  { key: "midnight", label: "Midnight", icon: Monitor, color: "#020617" },
  { key: "neon", label: "Glass Neon", icon: Sparkles, color: "#6366f1" },
];

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("zk_theme") || "dark");
  const wrapperRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("zk_theme", theme);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors = { dark: "#05070a", light: "#f8fafc", midnight: "#020617", neon: "#0a0a0f" };
      meta.setAttribute("content", colors[theme] || colors.dark);
    }
  }, [theme]);

  // Reliable click-outside handler (no invisible overlay needed)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ position: "relative", flexShrink: 0, zIndex: 1002 }}>
      <button 
        className="btn-icon-sm anim-bounce-glow" 
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }} 
        title="App Themes"
        aria-label="Toggle Theme"
        type="button"
      >
        <Palette size={18} strokeWidth={2.5} />
      </button>
      
      {open && (
        <div className="theme-switcher-popover" style={{ zIndex: 1003 }}>
          <div className="tsp-header">App Themes</div>
          {THEMES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                className={`tsp-accent ${theme === t.key ? "on" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setTheme(t.key);
                  setOpen(false);
                }}
              >
                <span className="tsp-swatch" style={{ background: t.color, boxShadow: `0 0 10px ${t.color}` }} />
                <Icon size={14} />
                <span className="tsp-label">{t.label}</span>
                {theme === t.key && <Check size={14} className="tsp-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
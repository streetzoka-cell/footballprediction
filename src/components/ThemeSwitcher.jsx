import { useState, useEffect } from "react";
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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("zk_theme", theme);

    // Update meta theme-color for mobile browsers
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors = { dark: "#05070a", light: "#f8fafc", midnight: "#020617", neon: "#0a0a0f" };
      meta.setAttribute("content", colors[theme] || colors.dark);
    }
  }, [theme]);

  return (
    <div style={{ position: "relative", flexShrink: 0, zIndex: 1000 }}>
      {/* ✅ Changed to btn-icon-sm anim-bounce-glow to match Search/Notif buttons */}
      <button 
        className="btn-icon-sm anim-bounce-glow" 
        onClick={() => setOpen(!open)} 
        title="App Themes"
        aria-label="Toggle Theme"
      >
        <Palette size={18} strokeWidth={2.5} />
      </button>
      
      {open && (
        <>
          {/* ✅ Increased z-index to 9999 to ensure it covers everything */}
          <div 
            style={{ position: "fixed", inset: 0, zIndex: 9999, cursor: 'default' }} 
            onClick={() => setOpen(false)} 
          />
          <div className="theme-switcher-popover">
            <div className="tsp-header">App Themes</div>
            {THEMES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  className={`tsp-accent ${theme === t.key ? "on" : ""}`}
                  onClick={() => {
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
        </>
      )}
    </div>
  );
}
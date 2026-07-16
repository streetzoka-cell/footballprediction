export default function PageLayout({ title, label, subtitle, children }) {
  return (
    <main
      style={{
        maxWidth: 1100,
        width: "100%",
        margin: "0 auto",
        padding: "52px 20px 100px",
        color: "var(--text-primary, #e2e8f0)",
        position: "relative",
        boxSizing: "border-box", // Crucial for preventing overflow
        overflowX: "hidden", // Blocks any accidental horizontal scroll
      }}
    >
      {/* Subtle background gradient */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "35vh",
        background: "radial-gradient(ellipse at 50% 0%, rgba(0,230,118,0.015) 0%, transparent 55%)",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", width: "100%" }}>
        {/* Decorative accent line */}
        <div style={{
          width: 48,
          height: 3,
          borderRadius: 2,
          background: "linear-gradient(90deg, transparent, var(--accent, #00e676), transparent)",
          margin: "0 auto 32px",
          opacity: 0.5,
          boxShadow: "0 0 12px rgba(0,230,118,0.1)",
        }} />

        <header
          style={{
            marginBottom: 44,
            borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
            paddingBottom: 28,
            display: "inline-block",
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box"
          }}
        >
          {/* Section label (Kicker) */}
          {(label || title) && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 16,
              animation: "v19-fade-up .5s cubic-bezier(0.22,1,0.36,1) both",
            }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "linear-gradient(135deg, rgba(0,230,118,0.1), rgba(0,230,118,0.02))",
                border: "1px solid rgba(0,230,118,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: "var(--accent, #00e676)",
                  boxShadow: "0 0 6px rgba(0,230,118,0.4)",
                }} />
              </div>
              <span style={{
                fontSize: "0.65rem",
                fontWeight: 700,
                color: "var(--text-muted, #64748b)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}>
                {label || title}
              </span>
            </div>
          )}

          {/* Title with gradient text */}
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(2rem, 5vw, 3.2rem)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              background: "linear-gradient(135deg, #ffffff 0%, #94a3b8 50%, #64748b 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textFillColor: "transparent",
              display: "inline-block",
              maxWidth: "100%",
            }}
          >
            {title}
          </h1>

          {/* Subtitle */}
          {subtitle && (
            <p
              style={{
                marginTop: 18,
                color: "var(--text-muted, #b8c4d6)",
                lineHeight: 1.8,
                fontSize: "clamp(0.95rem, 2.2vw, 1.15rem)",
                maxWidth: 760,
                textAlign: "center",
                marginLeft: "auto",
                marginRight: "auto",
                animation: "v19-fade-up .5s cubic-bezier(0.22,1,0.36,1) .15s both",
              }}
            >
              {subtitle}
            </p>
          )}
        </header>

        {/* Content with staggered fade-in */}
        <div style={{ animation: "v19-fade-up .5s cubic-bezier(0.22,1,0.36,1) .25s both", textAlign: "left", width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
          <div style={{ display: "grid", gap: 36, width: "100%" }}>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
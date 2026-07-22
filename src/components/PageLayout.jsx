export default function PageLayout({ title, label, subtitle, children }) {
  return (
    <main className="info-page-layout">
      <div className="info-page-bg" />
      <div className="info-page-inner">
        <div className="info-page-accent" />
        <header className="info-page-header">
          {(label || title) && (
            <div className="info-page-kicker">
              <div className="info-page-kicker-icon">
                <div className="info-page-kicker-dot" />
              </div>
              <span className="info-page-kicker-text">{label || title}</span>
            </div>
          )}
          <h1 className="info-page-title">{title}</h1>
          {subtitle && <p className="info-page-subtitle">{subtitle}</p>}
        </header>
        <div className="info-page-content">
          <div style={{ display: "grid", gap: 36, width: "100%" }}>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
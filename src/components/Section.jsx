export default function Section({ title, icon: Icon, children }) {
  return (
    <section style={{ animation: "v19-fade-up .5s cubic-bezier(.22,1,.36,1) both" }}>
      <h2 style={{
        fontSize: "1.5rem",
        fontWeight: 800,
        marginBottom: "20px",
        color: "var(--text-primary, #ffffff)",
        display: "flex",
        alignItems: "center",
        gap: "10px"
      }}>
        {Icon && <Icon size={20} style={{ color: "var(--accent, #00e676)" }} />}
        {title}
      </h2>
      <div style={{
        color: "var(--text-muted, #b8c4d6)",
        lineHeight: 1.8,
        fontSize: "1rem",
        background: "var(--bg-card, #111827)",
        border: "1px solid var(--border, #1e293b)",
        borderRadius: "16px",
        padding: "28px"
      }}>
        {children}
      </div>
    </section>
  );
}
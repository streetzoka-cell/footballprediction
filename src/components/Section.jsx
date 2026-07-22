export default function Section({ title, icon: Icon, children }) {
  return (
    <section className="info-section">
      <h2 className="info-section-title">
        {Icon && <Icon size={20} className="info-section-icon" />}
        {title}
      </h2>
      <div className="info-section-content">
        {children}
      </div>
    </section>
  );
}
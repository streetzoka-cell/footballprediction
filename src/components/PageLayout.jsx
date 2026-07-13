import PropTypes from "prop-types";

export default function PageLayout({
  title,
  subtitle,
  children,
}) {
  return (
    <main
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "48px 20px 80px",
        color: "#ffffff",
      }}
    >
      <header
        style={{
          marginBottom: 40,
          borderBottom: "1px solid rgba(255,255,255,.08)",
          paddingBottom: 24,
        }}
      >
        <h1
          style={{
            fontSize: "clamp(2rem,5vw,3.2rem)",
            margin: 0,
            fontWeight: 800,
          }}
        >
          {title}
        </h1>

        {subtitle && (
          <p
            style={{
              marginTop: 16,
              color: "#b8c4d6",
              lineHeight: 1.8,
              fontSize: "1.05rem",
              maxWidth: 760,
            }}
          >
            {subtitle}
          </p>
        )}
      </header>

      <div
        style={{
          display: "grid",
          gap: 36,
        }}
      >
        {children}
      </div>
    </main>
  );
}

PageLayout.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  children: PropTypes.node,
};
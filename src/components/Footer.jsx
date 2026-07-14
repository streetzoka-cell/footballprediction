import { Link } from "react-router-dom";

const year = new Date().getFullYear();

const sections = [
  {
    title: "Sports",
    links: [
      { label: "Live Scores", to: "/" },
      { label: "Fixtures", to: "/fixtures" },
      { label: "Predictions", to: "/predictions" },
      { label: "Basketball", to: "/basketball" },
      { label: "Highlights", to: "/highlights" },
      { label: "Leaderboard", to: "/leaderboard" },
      { label: "Master Games", to: "/mastergames" },
      { label: "Live Stream", to: "/livestream" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", to: "/about" },
      { label: "Team", to: "/team" },
      { label: "Careers", to: "/careers" },
      { label: "Contact", to: "/contact" },
      { label: "Partners", to: "/partners" },
      { label: "Advertise", to: "/advertise" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", to: "/help-center" },
      { label: "FAQ", to: "/faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", to: "/terms" },
    ],
  },
];

const socialLinks = [
  {
    name: "Twitter",
    href: "#",
    icon: (
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    name: "Facebook",
    href: "#",
    icon: (
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "#",
    icon: (
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    name: "Telegram",
    href: "#",
    icon: (
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    name: "YouTube",
    href: "#",
    icon: (
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
];

const styles = {
  footer: {
    background: "#0a1628",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    marginTop: 60,
  },
  container: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "0 24px",
  },
  newsletter: {
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    padding: "40px 0",
  },
  newsletterInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    flexWrap: "wrap",
  },
  newsletterTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: 600,
    margin: "0 0 4px 0",
  },
  newsletterDesc: {
    color: "#8899aa",
    fontSize: 14,
    margin: 0,
  },
  newsletterForm: {
    display: "flex",
    flex: 1,
    maxWidth: 360,
  },
  newsletterInput: {
    flex: 1,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRight: "none",
    borderRadius: "8px 0 0 8px",
    padding: "10px 16px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
  },
  newsletterBtn: {
    background: "#16a34a",
    color: "#fff",
    border: "none",
    borderRadius: "0 8px 8px 0",
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  main: {
    padding: "48px 0",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "2fr repeat(4, 1fr)",
    gap: 40,
  },
  brandLogo: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    textDecoration: "none",
  },
  logoIcon: {
    width: 36,
    height: 36,
    background: "#16a34a",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 18,
  },
  logoText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.3px",
  },
  brandDesc: {
    color: "#8899aa",
    fontSize: 14,
    lineHeight: 1.7,
    margin: "0 0 24px 0",
    maxWidth: 300,
  },
  contactItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#8899aa",
    fontSize: 13,
    textDecoration: "none",
    marginBottom: 10,
  },
  socials: {
    display: "flex",
    gap: 8,
    marginTop: 20,
  },
  socialBtn: {
    width: 36,
    height: 36,
    background: "rgba(255,255,255,0.05)",
    border: "none",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#8899aa",
    cursor: "pointer",
    textDecoration: "none",
    transition: "all 0.2s ease",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "1px",
    margin: "0 0 16px 0",
  },
  linkList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  linkItem: {
    marginBottom: 12,
  },
  link: {
    color: "#8899aa",
    fontSize: 14,
    textDecoration: "none",
    transition: "color 0.2s ease",
  },
  bottom: {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    padding: "20px 0",
  },
  bottomInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  copyright: {
    color: "#556677",
    fontSize: 13,
    margin: 0,
  },
  credit: {
    color: "#556677",
    fontSize: 13,
    margin: 0,
  },
  creditName: {
    color: "#fff",
    fontWeight: 600,
  },
};

export default function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.container}>
        {/* Newsletter */}
        <div style={styles.newsletter}>
          <div style={styles.newsletterInner}>
            <div>
              <h3 style={styles.newsletterTitle}>Stay Updated</h3>
              <p style={styles.newsletterDesc}>Get the latest predictions and scores in your inbox.</p>
            </div>
            <div style={styles.newsletterForm}>
              <input
                type="email"
                placeholder="Enter your email"
                style={styles.newsletterInput}
              />
              <button style={styles.newsletterBtn}>Subscribe</button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div style={styles.main}>
          <div style={styles.grid}>
            {/* Brand */}
            <div>
              <Link to="/" style={styles.brandLogo}>
                <span style={styles.logoIcon}>⚽</span>
                <span style={styles.logoText}>ZOKASCORE</span>
              </Link>
              <p style={styles.brandDesc}>
                Live football scores, fixtures, predictions, standings, basketball, statistics and sports updates.
              </p>
              <a href="mailto:info@zokascore.com" style={styles.contactItem}>📧 info@zokascore.com</a>
              <a href="tel:+254700000000" style={styles.contactItem}>📞 +254 700 000 000</a>
              <div style={styles.contactItem}>📍 Nairobi, Kenya</div>
              <div style={styles.socials}>
                {socialLinks.map((s) => (
                  <a
                    key={s.name}
                    href={s.href}
                    aria-label={s.name}
                    style={styles.socialBtn}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#16a34a";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.color = "#8899aa";
                    }}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>

            {/* Link Sections */}
            {sections.map((section) => (
              <div key={section.title}>
                <h4 style={styles.sectionTitle}>{section.title}</h4>
                <ul style={styles.linkList}>
                  {section.links.map((link) => (
                    <li key={link.to} style={styles.linkItem}>
                      <Link
                        to={link.to}
                        style={styles.link}
                        onMouseEnter={(e) => (e.target.style.color = "#22c55e")}
                        onMouseLeave={(e) => (e.target.style.color = "#8899aa")}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div style={styles.bottom}>
          <div style={styles.bottomInner}>
            <p style={styles.copyright}>© {year} ZOKASCORE. All rights reserved.</p>
            <p style={styles.credit}>
              Built by <span style={styles.creditName}>Kimutai Gibson</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
import React from 'react';
import { Link } from 'react-router-dom';
import SEO from "../../components/SEO";

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0a1628',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
  },
  hero: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
  },
  container: {
    maxWidth: 700,
    width: '100%',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    color: '#8899aa',
    textDecoration: 'none',
    marginBottom: '60px',
    fontSize: '14px',
  },
  badge: {
    display: 'inline-block',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    color: '#22c55e',
    padding: '6px 16px',
    borderRadius: 50,
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    marginBottom: '24px',
  },
  title: {
    fontSize: 'clamp(40px, 8vw, 72px)',
    fontWeight: 800,
    margin: '0 0 24px 0',
    lineHeight: 1.1,
    background: 'linear-gradient(135deg, #ffffff 0%, #8899aa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '18px',
    color: '#8899aa',
    lineHeight: 1.8,
    margin: '0 auto 48px auto',
    maxWidth: 550,
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '48px',
  },
  statBox: {
    background: '#111827',
    padding: '24px 16px',
  },
  statNumber: {
    fontSize: '28px',
    fontWeight: 800,
    color: '#22c55e',
    margin: '0 0 4px 0',
  },
  statLabel: {
    fontSize: '12px',
    color: '#556677',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: 0,
  },
  techStack: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '40px',
  },
  techPill: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: '#8899aa',
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: '13px',
  },
  ctaBox: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    paddingTop: 40,
  },
  ctaText: {
    color: '#8899aa',
    fontSize: '15px',
    margin: '0 0 20px 0',
  },
  ctaBtn: {
    display: 'inline-block',
    background: 'transparent',
    border: '1px solid #16a34a',
    color: '#22c55e',
    padding: '12px 32px',
    borderRadius: 8,
    fontSize: '15px',
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'all 0.2s',
  },
  footer: {
    padding: '20px',
    textAlign: 'center',
  },
  footerText: {
    color: '#334155',
    fontSize: '13px',
    margin: 0,
  }
};

export default function Team() {
  return (
    <div style={styles.page}>
      <SEO
        title="Meet the ZOKASCORE Developer | Solo Dev Team"
        description="Learn about the solo developer behind ZOKASCORE. Designed, coded, and maintained by one passionate creator dedicated to delivering the ultimate football experience."
        keywords="ZOKASCORE team, solo developer, about the developer, football prediction creator, Kimutai Gibson"
        robots="index,follow"
      />
      
      <div style={styles.hero}>
        <div style={styles.container}>
          
          <Link to="/" style={styles.backLink}>← Back</Link>
          
          <div style={styles.badge}>Solo Dev</div>
          
          <h1 style={styles.title}>
            Built by one.<br/>
            <span style={{ color: '#22c55e', WebkitTextFillColor: '#22c55e' }}>Zero shortcuts.</span>
          </h1>
          
          <p style={styles.subtitle}>
            ZOKASCORE isn't built by an agency or a massive team. It's designed, coded, and maintained by one person fuelled by coffee and football stats.
          </p>

          <div style={styles.stats}>
            <div style={styles.statBox}>
              <h2 style={styles.statNumber}>1</h2>
              <p style={styles.statLabel}>Developer</p>
            </div>
            <div style={styles.statBox}>
              <h2 style={styles.statNumber}>100%</h2>
              <p style={styles.statLabel}>Handwritten</p>
            </div>
            <div style={styles.statBox}>
              <h2 style={styles.statNumber}>24/7</h2>
              <p style={styles.statLabel}>Grind Mode</p>
            </div>
          </div>

          <div style={styles.techStack}>
            {['React', 'Vite', 'Firebase', 'Tailwind', 'React Router', 'REST APIs', 'SEO', 'Netlify & Vercel'].map(tech => (
              <span key={tech} style={styles.techPill}>{tech}</span>
            ))}
          </div>

          <div style={styles.ctaBox}>
            <p style={styles.ctaText}>
              Think you can add value to ZOKASCORE?
            </p>
            <Link 
              to="/contact" 
              style={styles.ctaBtn}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#16a34a';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#22c55e';
              }}
            >
              Hit Me Up
            </Link>
          </div>

        </div>
      </div>
      
      <div style={styles.footer}>
        <p style={styles.footerText}>Kimutai Gibson © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
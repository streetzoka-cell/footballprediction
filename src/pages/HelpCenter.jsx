import React from 'react';
import { Link } from 'react-router-dom';
import SEO from "../components/SEO";
const styles = {
  page: {
    minHeight: '100vh',
    background: '#0a1628',
    color: '#ffffff',
  },
  header: {
    background: 'linear-gradient(to right, #16a34a, #059669)',
    padding: '48px 16px',
  },
  headerContent: {
    maxWidth: 896,
    margin: '0 auto',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: '#bbf7d0',
    textDecoration: 'none',
    marginBottom: 16,
    fontSize: '14px',
  },
  title: {
    fontSize: '30px',
    fontWeight: 'bold',
    margin: '0 0 8px 0',
  },
  subtitle: {
    color: '#bbf7d0',
    margin: 0,
    fontSize: '16px',
  },
  container: {
    maxWidth: 896,
    margin: '0 auto',
    padding: '32px 16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
    marginBottom: 32,
  },
  card: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: 24,
    transition: 'border-color 0.2s',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: '#22c55e',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 4px 0',
  },
  cardDesc: {
    color: '#8899aa',
    fontSize: '13px',
    margin: '0 0 16px 0',
    lineHeight: 1.5,
  },
  btn: {
    display: 'inline-block',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    fontFamily: 'inherit',
    textDecoration: 'none',
    transition: 'all 0.2s',
  },
  formBox: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: '32px',
  },
  formTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0 0 4px 0',
  },
  formDesc: {
    color: '#8899aa',
    fontSize: '14px',
    margin: '0 0 24px 0',
  },
  success: {
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    color: '#22c55e',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: 24,
  },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#8899aa',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '8px',
    background: '#1e293b',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '8px',
    background: '#1e293b',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    minHeight: 120,
    resize: 'vertical',
    transition: 'border-color 0.2s',
  },
  submitBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.2s',
  },
};

const contactMethods = [
  {
    title: 'Live Chat',
    description: 'Chat with us in real-time',
    action: 'Start Chat',
    bg: '#16a34a',
    hoverBg: '#15803d',
    iconBg: 'rgba(34,197,94,0.1)',
    iconColor: '#22c55e',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: 'Email Support',
    description: 'streetzoka@gmail.com',
    action: 'Send Email',
    bg: '#2563eb',
    hoverBg: '#1d4ed8',
    iconBg: 'rgba(37,99,235,0.1)',
    iconColor: '#60a5fa',
    link: 'mailto:streetzoka@gmail.com',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    title: 'Phone Support',
    description: 'Mon-Fri, 9AM - 6PM',
    action: 'Call Now',
    bg: '#7c3aed',
    hoverBg: '#6d28d9',
    iconBg: 'rgba(124,58,237,0.1)',
    iconColor: '#a78bfa',
    link: 'tel:+254721635810',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
  {
    title: 'FAQ',
    description: 'Browse common questions',
    action: 'View FAQ',
    bg: '#ea580c',
    hoverBg: '#c2410c',
    iconBg: 'rgba(234,88,12,0.1)',
    iconColor: '#fb923c',
    link: '/faq',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
];

export default function HelpCenter() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
const [submitted, setSubmitted] = useState(false);
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    setFormData({ name: '', email: '', subject: '', message: '' });
  };

  const focusInput = (e) => {
    e.target.style.borderColor = '#22c55e';
  };
  const blurInput = (e) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.08)';
  };

  return (
    <div style={styles.page}>
      <SEO title="Help Center — ZokaPredict" description="Get help with ZokaPredict. Contact support via chat, email, or phone." path="/help-center" />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <Link to="/" style={styles.backLink}>← Back to Home</Link>
          <h1 style={styles.title}>Help Center</h1>
          <p style={styles.subtitle}>We're here to help you with any questions or issues</p>
        </div>
      </div>

      <div style={styles.container}>
        {/* Contact Methods */}
        <div style={styles.grid}>
          {contactMethods.map((method, index) => (
            <div
              key={index}
              style={styles.card}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
            >
              <div style={styles.cardHeader}>
                <div style={{ ...styles.icon, background: method.iconBg, color: method.iconColor }}>
                  {method.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={styles.cardTitle}>{method.title}</h3>
                  <p style={styles.cardDesc}>{method.description}</p>
                  {method.link?.startsWith('/') ? (
                    <Link
                      to={method.link}
                      style={{ ...styles.btn, background: method.bg }}
                      onMouseEnter={(e) => (e.target.style.background = method.hoverBg)}
                      onMouseLeave={(e) => (e.target.style.background = method.bg)}
                    >
                      {method.action}
                    </Link>
                  ) : (
                    <a
                      href={method.link || '#'}
                      style={{ ...styles.btn, background: method.bg }}
                      onMouseEnter={(e) => (e.target.style.background = method.hoverBg)}
                      onMouseLeave={(e) => (e.target.style.background = method.bg)}
                    >
                      {method.action}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Contact Form */}
        <div style={styles.formBox}>
          <h2 style={styles.formTitle}>Send us a message</h2>
          <p style={styles.formDesc}>Fill out the form below and we'll get back to you within 24 hours</p>

          {submitted && <div style={styles.success}>✅ Message sent successfully! We'll respond soon.</div>}

          <form onSubmit={handleSubmit}>
            <div style={styles.fieldRow}>
              <div>
                <label style={styles.label}>Name</label>
                <input
                  style={styles.input}
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  onFocus={focusInput}
                  onBlur={blurInput}
                  placeholder="Your name"
                  required
                />
              </div>
              <div>
                <label style={styles.label}>Email</label>
                <input
                  style={styles.input}
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onFocus={focusInput}
                  onBlur={blurInput}
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Subject</label>
              <input
                style={styles.input}
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                onFocus={focusInput}
                onBlur={blurInput}
                placeholder="What's this about?"
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Message</label>
              <textarea
                style={styles.textarea}
                name="message"
                value={formData.message}
                onChange={handleChange}
                onFocus={focusInput}
                onBlur={blurInput}
                placeholder="Describe your issue or question..."
                required
              />
            </div>
            <button
              type="submit"
              style={styles.submitBtn}
              onMouseEnter={(e) => (e.target.style.background = '#15803d')}
              onMouseLeave={(e) => (e.target.style.background = '#16a34a')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
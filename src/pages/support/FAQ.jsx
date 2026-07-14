import React from 'react';
import { Link } from 'react-router-dom';
import SEO from '../../components/SEO';

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
    maxWidth: 768,
    margin: '0 auto',
    textAlign: 'center',
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
    maxWidth: 768,
    margin: '0 auto',
    padding: '32px 16px',
  },
  faqItem: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    marginBottom: '12px',
    overflow: 'hidden',
  },
  faqButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px',
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'background 0.2s',
  },
  chevron: {
    flexShrink: 0,
    marginLeft: 16,
    color: '#22c55e',
    transition: 'transform 0.3s',
  },
  answer: {
    padding: '0 20px',
    color: '#8899aa',
    lineHeight: 1.8,
    fontSize: '14px',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
  },
  answerOpen: {
    paddingBottom: '20px',
  },
  helpBox: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center',
    marginTop: '32px',
  },
  helpIcon: {
    width: 40,
    height: 40,
    color: '#22c55e',
    margin: '0 auto 16px auto',
  },
  helpTitle: {
    fontSize: '20px',
    fontWeight: 600,
    margin: '0 0 8px 0',
  },
  helpDesc: {
    color: '#8899aa',
    fontSize: '14px',
    margin: '0 0 24px 0',
  },
  helpBtn: {
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
    textDecoration: 'none',
    transition: 'background 0.2s',
  },
};

const faqData = [
  {
    question: 'How do football predictions work?',
    answer: 'Our predictions are based on statistical analysis of team performance, head-to-head records, current form, injury reports, and other key factors. We use advanced algorithms to calculate the probability of different outcomes.',
  },
  {
    question: 'Are the predictions guaranteed?',
    answer: 'No prediction is 100% guaranteed. Football is unpredictable by nature. Our predictions provide probabilistic insights to help you make informed decisions, but they should not be considered as certain outcomes.',
  },
  {
    question: 'How often are predictions updated?',
    answer: 'Predictions are updated daily, with last-minute changes (like injury news or lineup changes) reflected as soon as the information becomes available.',
  },
  {
    question: 'Is the app free to use?',
    answer: 'Yes! We offer free predictions daily. Premium users get access to additional features like detailed analysis, more predictions, and priority notifications.',
  },
  {
    question: 'How do I contact support?',
    answer: 'You can reach us through the Help Center, email us at streetzoka@gmail.com, or use the contact form available 24/7.',
  },
  {
    question: 'Which leagues are covered?',
    answer: 'We cover major leagues including the English Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, and many more leagues worldwide.',
  },
];

const ChevronIcon = ({ rotated }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ ...styles.chevron, transform: rotated ? 'rotate(180deg)' : 'rotate(0deg)' }}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const MessageIcon = () => (
  <svg style={styles.helpIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function FAQ() {
  const [openIndex, setOpenIndex] = React.useState(null);

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div style={styles.page}>
      <SEO title="FAQ — ZokaPredict" description="Find answers to common questions about ZokaPredict predictions, leagues, and features." path="/faq" />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>Frequently Asked Questions</h1>
          <p style={styles.subtitle}>Find answers to common questions about ZokaPredict</p>
        </div>
      </div>

      {/* FAQ List */}
      <div style={styles.container}>
        {faqData.map((faq, index) => (
          <div key={index} style={styles.faqItem}>
            <button
              style={styles.faqButton}
              onClick={() => toggleFAQ(index)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ paddingRight: 16 }}>{faq.question}</span>
              <ChevronIcon rotated={openIndex === index} />
            </button>
            <div
              style={{
                ...styles.answer,
                maxHeight: openIndex === index ? '300px' : '0',
                ...openIndex === index ? styles.answerOpen : {},
              }}
            >
              {faq.answer}
            </div>
          </div>
        ))}

        {/* Still Need Help */}
        <div style={styles.helpBox}>
          <MessageIcon />
          <h3 style={styles.helpTitle}>Still have questions?</h3>
          <p style={styles.helpDesc}>Can't find what you're looking for? We're here to help.</p>
          <Link
            to="/help-center"
            style={styles.helpBtn}
            onMouseEnter={(e) => (e.target.style.background = '#15803d')}
            onMouseLeave={(e) => (e.target.style.background = '#16a34a')}
          >
            Visit Help Center →
          </Link>
        </div>
      </div>
    </div>
  );
}
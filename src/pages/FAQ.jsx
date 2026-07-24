import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';

const faqData = [
  { question: 'How do football predictions work?', answer: 'Our predictions are based on statistical analysis of team performance, head-to-head records, current form, injury reports, and other key factors. We use advanced algorithms to calculate the probability of different outcomes.' },
  { question: 'Are the predictions guaranteed?', answer: 'No prediction is 100% guaranteed. Football is unpredictable by nature. Our predictions provide probabilistic insights to help you make informed decisions, but they should not be considered as certain outcomes.' },
  { question: 'How often are predictions updated?', answer: 'Predictions are updated daily, with last-minute changes (like injury news or lineup changes) reflected as soon as the information becomes available.' },
  { question: 'Is the app free to use?', answer: 'Yes! We offer free predictions daily. Premium users get access to additional features like detailed analysis, more predictions, and priority notifications.' },
  { question: 'How do I contact support?', answer: 'You can reach us through the Help Center, email us at streetzoka@gmail.com, or use the contact form available 24/7.' },
  { question: 'Which leagues are covered?', answer: 'We cover major leagues including the English Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, and many more leagues worldwide.' },
];

const ChevronIcon = ({ rotated }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="info-chevron" style={{ transform: rotated ? 'rotate(180deg)' : 'rotate(0deg)' }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const MessageIcon = () => (
  <svg className="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFAQ = (index) => setOpenIndex(openIndex === index ? null : index);

  return (
    <div className="info-page">
      <SEO title="ZOKASCORE FAQ: Football Predictions Support" description="Find answers to frequently asked questions about ZOKASCORE. Learn how to make predictions, join leaderboards, and manage your account with our FAQ." keywords="FAQ, ZOKASCORE support, help, football predictions questions, account help" robots="index,follow" />
      
      <div className="info-header">
        <div className="info-header-content">
          <h1 className="info-title">Frequently Asked Questions</h1>
          <p className="info-subtitle">Find answers to common questions about ZokaPredict</p>
        </div>
      </div>

      <div className="info-container">
        {faqData.map((faq, index) => (
          <div key={index} className="info-faq-item">
            <button className="info-faq-button" onClick={() => toggleFAQ(index)}>
              <span style={{ paddingRight: 16 }}>{faq.question}</span>
              <ChevronIcon rotated={openIndex === index} />
            </button>
            <div className={`info-answer ${openIndex === index ? 'info-answer-open' : ''}`}>
              {faq.answer}
            </div>
          </div>
        ))}

        <div className="info-help-box">
          <MessageIcon />
          <h3 className="info-help-title">Still have questions?</h3>
          <p className="info-help-desc">Can't find what you're looking for? We're here to help.</p>
          <Link to="/help-center" className="info-help-btn">Visit Help Center →</Link>
        </div>
      </div>
    </div>
  );
}
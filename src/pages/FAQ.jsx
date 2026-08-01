import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MessageSquare } from 'lucide-react';
import SEO from '../components/SEO';

const faqData = [
  { question: 'How do football predictions work?', answer: 'Our predictions are based on statistical analysis of team performance, head-to-head records, current form, injury reports, and other key factors. We use advanced algorithms to calculate the probability of different outcomes.' },
  { question: 'Are the predictions guaranteed?', answer: 'No prediction is 100% guaranteed. Football is unpredictable by nature. Our predictions provide probabilistic insights to help you make informed decisions, but they should not be considered as certain outcomes.' },
  { question: 'How often are predictions updated?', answer: 'Predictions are updated daily, with last-minute changes (like injury news or lineup changes) reflected as soon as the information becomes available.' },
  { question: 'Is the app free to use?', answer: 'Yes! We offer free predictions daily. Premium users get access to additional features like detailed analysis, more predictions, and priority notifications.' },
  { question: 'How do I contact support?', answer: 'You can reach us through the Help Center, email us at streetzoka@gmail.com, or use the contact form available 24/7.' },
  { question: 'Which leagues are covered?', answer: 'We cover major leagues including the English Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, and many more leagues worldwide.' },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFAQ = (index) => setOpenIndex(openIndex === index ? null : index);

  return (
    <div className="zoka-page">
      <SEO
        title="Frequently Asked Questions (FAQ)"
        description="Browse answers to frequently asked questions about ZOKASCORE, including football predictions, fixtures, live scores, leaderboards, accounts, scoring, and platform features."
        keywords="ZOKASCORE FAQ, football predictions FAQ, live scores help, fixtures help, leaderboard help, account support, football questions"
        robots="index,follow"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "FAQ", path: "/faq" }]}
      />

      <div className="zoka-wrap">
        <div className="glass-card p-24 mb-16 text-center">
          <h1 className="text-primary font-extrabold text-lg">Frequently Asked Questions</h1>
          <p className="text-muted text-sm mt-4">Find answers to common questions about ZokaPredict</p>
        </div>

        <div className="flex-col gap-12">
          {faqData.map((faq, index) => (
            <div key={index} className="glass-card overflow-hidden">
              <button className="w-full flex-between p-16 text-left" onClick={() => toggleFAQ(index)}>
                <span className="text-primary font-bold text-sm pr-16">{faq.question}</span>
                <ChevronDown size={20} className="text-muted" style={{ transform: openIndex === index ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} />
              </button>
              <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: openIndex === index ? '200px' : '0' }}>
                <p className="text-secondary text-sm p-16 pt-0">{faq.answer}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-card flex-col items-center gap-12 p-24 mt-16 text-center">
          <MessageSquare size={32} className="text-primary" />
          <h3 className="text-primary font-bold">Still have questions?</h3>
          <p className="text-muted text-sm">Can't find what you're looking for? We're here to help.</p>
          <Link to="/help-center" className="btn btn-primary">Visit Help Center →</Link>
        </div>
      </div>
    </div>
  );
}
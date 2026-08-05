import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MessageSquare, HelpCircle } from 'lucide-react';
import SEO from '../components/SEO';
import { seoGenerators } from '../utils/seoBuilder';

const faqData = [
  { q: 'How do football predictions work on ZOKASCORE?', a: 'Our predictions are powered by a combination of statistical analysis, team form, head-to-head records, injury reports, and our proprietary Zoka AI engine. We calculate the probability of different outcomes to give you the best edge.' },
  { q: 'Are the football predictions guaranteed?', a: 'No prediction is 100% guaranteed. Football is inherently unpredictable. Our data and AI provide probabilistic insights to help you make informed decisions, but they should be used as part of your own research.' },
  { q: 'How often are live scores and fixtures updated?', a: 'Live scores update in real-time (every 5-10 seconds) during matches. Fixtures and odds are updated daily, with last-minute changes like lineup drops reflected instantly via our live sync engine.' },
  { q: 'Is ZOKASCORE free to use?', a: 'Yes! ZOKASCORE is 100% free. You can view live scores, read AI tactical analysis, and make predictions to climb the leaderboard without paying anything.' },
  { q: 'How do I join the prediction leaderboard?', a: 'Simply create a free account, navigate to the Predictions or Fixtures page, and lock in your score predictions before kickoff. You earn points for exact scores and correct match outcomes.' },
  { q: 'Which football leagues are covered?', a: 'We cover over 100 leagues worldwide, including the English Premier League, La Liga, Serie A, Bundesliga, Ligue 1, UEFA Champions League, and major international tournaments.' },
  { q: 'What is Zoka AI?', a: 'Zoka AI (Kim) is our elite football analyst AI. You can ask it for tactical breakdowns, match previews, team form analysis, and personalized insights on any match or team.' },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  const toggleFAQ = (index) => setOpenIndex(openIndex === index ? null : index);

  // ★ SEO GOLD: Generate FAQPage Schema for Google Rich Snippets
  const seo = useMemo(() => seoGenerators.faqPage({ 
    faqs: faqData, 
    path: '/faq' 
  }), []);

  return (
    <div className="zoka-page">
      <SEO {...seo} />

      <div className="zoka-wrap">
        <div className="glass-card p-24 mb-24 text-center">
          <div className="flex-center gap-12 mb-12">
            <div className="flex-center" style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>
              <HelpCircle size={24} />
            </div>
          </div>
          <h1 className="text-primary font-extrabold text-2xl mb-8">Frequently Asked Questions</h1>
          <p className="text-muted text-sm max-w-500 mx-auto">
            Everything you need to know about ZOKASCORE's live scores, AI predictions, leaderboards, and platform features.
          </p>
        </div>

        <div className="flex-col gap-12 mb-24">
          {faqData.map((faq, index) => (
            <div key={index} className="glass-card overflow-hidden transition-all duration-300" style={{ border: openIndex === index ? '1px solid var(--primary)' : '1px solid var(--border)' }}>
              <button 
                className="w-full flex-between p-20 text-left" 
                onClick={() => toggleFAQ(index)}
                aria-expanded={openIndex === index}
                aria-controls={`faq-answer-${index}`}
              >
                <h2 className="text-primary font-bold text-base pr-16">{faq.q}</h2>
                <ChevronDown 
                  size={20} 
                  className="text-muted flex-shrink-0" 
                  style={{ 
                    transform: openIndex === index ? 'rotate(180deg)' : 'rotate(0deg)', 
                    transition: 'transform 0.3s ease' 
                  }} 
                />
              </button>
              <div 
                id={`faq-answer-${index}`}
                className="overflow-hidden transition-all duration-300" 
                style={{ maxHeight: openIndex === index ? '500px' : '0' }}
              >
                <p className="text-secondary text-sm p-20 pt-0 leading-relaxed">{faq.a}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ★ SEO INTERNAL LINKING: Keep Googlebot crawling */}
        <div className="glass-card flex-col items-center gap-12 p-24 text-center">
          <MessageSquare size={32} className="text-primary" />
          <h3 className="text-primary font-bold text-lg">Still have questions?</h3>
          <p className="text-muted text-sm max-w-400">Can't find what you're looking for? Our support team and Zoka AI are here to help.</p>
          <div className="flex gap-12 mt-8 flex-wrap justify-center">
            <Link to="/help-center" className="btn btn-primary">Visit Help Center</Link>
            <Link to="/contact" className="btn btn-ghost">Contact Support</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MessageSquare, HelpCircle, Mail } from 'lucide-react';
import SEO from '../components/SEO';
import { seoGenerators } from '../utils/seoBuilder';

const faqData = [
  { q: 'How do football predictions work?', a: 'Our predictions are powered by statistical analysis, team form, and our proprietary Zoka AI engine.' },
  { q: 'Are the football predictions guaranteed?', a: 'No prediction is 100% guaranteed. Football is inherently unpredictable.' },
  { q: 'Is ZOKASCORE free to use?', a: 'Yes! ZOKASCORE is 100% free. You can view live scores and make predictions without paying.' },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);
  const toggleFAQ = (index) => setOpenIndex(openIndex === index ? null : index);
  const seo = useMemo(() => seoGenerators.faqPage({ faqs: faqData, path: '/faq' }), []);

  return (
    <div className="company-page">
      <SEO {...seo} />
      <div className="company-hero-card">
        <div className="company-hero-icon"><HelpCircle size={28} /></div>
        <h1 className="text-primary font-extrabold text-2xl">Frequently Asked Questions</h1>
        <p className="text-muted text-sm">Everything you need to know about ZOKASCORE.</p>
      </div>

      <div className="flex-col gap-12 mb-24">
        {faqData.map((faq, index) => (
          <div key={index} className={`faq-item ${openIndex === index ? 'open' : ''}`}>
            <button className="faq-q" onClick={() => toggleFAQ(index)}>
              <h2>{faq.q}</h2>
              <ChevronDown size={20} className="text-muted" style={{ transform: openIndex === index ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }} />
            </button>
            <div className="faq-a" style={{ maxHeight: openIndex === index ? '500px' : '0' }}>
              <p>{faq.a}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="company-card flex-col items-center gap-12 text-center">
        <MessageSquare size={32} className="text-primary" />
        <h3 className="text-primary font-bold text-lg">Still have questions?</h3>
        <p className="text-muted text-sm">Our support team is here to help.</p>
        <div className="flex gap-12 flex-wrap justify-center">
          <Link to="/help-center" className="btn btn-primary">Help Center</Link>
          <Link to="/contact" className="btn btn-ghost">Contact Support</Link>
        </div>
      </div>
    </div>
  );
}
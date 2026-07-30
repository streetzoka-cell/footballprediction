import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Share2, Copy, Printer, ChevronRight, Clock, ArrowLeft } from 'lucide-react';
import SEO from './SEO'; // Adjust path if needed

// ★ Reading Progress Hook
const useReadingProgress = () => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const updateScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight > 0) setProgress((window.scrollY / scrollHeight) * 100);
    };
    window.addEventListener('scroll', updateScroll);
    return () => window.removeEventListener('scroll', updateScroll);
  }, []);
  return progress;
};

export default function PageLayout({ 
  seo, 
  title, 
  label, 
  subtitle, 
  children, 
  accentColor = '#10b981',
  heroImage,
  size = 'default', // 'narrow', 'default', 'wide'
  lastUpdated,
  breadcrumbs,
  actions,
  cta
}) {
  const progress = useReadingProgress();
  const contentRef = useRef(null);
  const [headings, setHeadings] = useState([]);
  const [readingTime, setReadingTime] = useState(1);

  // ★ Auto-generate TOC & Reading Time from children DOM
  useEffect(() => {
    if (!contentRef.current) return;
    
    const elements = Array.from(contentRef.current.querySelectorAll('h2, h3'));
    const generatedHeadings = elements.map((el, i) => {
      const id = el.id || `pl-section-${i}`;
      el.id = id; // Assign ID if missing
      return { id, text: el.innerText, tag: el.tagName.toLowerCase() };
    });
    setHeadings(generatedHeadings);

    const text = contentRef.current.innerText || '';
    const words = text.trim().split(/\s+/).length;
    setReadingTime(Math.max(1, Math.ceil(words / 200)));
  }, [children]);

  // ★ Page Actions
  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try { await navigator.share({ title, url: window.location.href }); } catch {}
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  }, [title]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied!');
  }, []);

  const handlePrint = useCallback(() => window.print(), []);

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try { return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } 
    catch { return null; }
  };

  const widthClass = size === 'narrow' ? 'pl-max-800' : size === 'wide' ? 'pl-max-1200' : 'pl-max-1000';

  return (
    <>
      {seo && <SEO {...seo} />}
      
      {/* Reading Progress Bar */}
      <div className="pl-progress-bar" style={{ width: `${progress}%`, background: accentColor }} />
      
      <main className={`pl-layout ${widthClass}`} aria-labelledby="page-title">
        <div className="pl-bg-glow" style={{ background: `radial-gradient(circle at top, ${accentColor}15, transparent 70%)` }} />
        
        <div className="pl-container">
          
          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="pl-breadcrumbs" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={i}>
                  <Link to={crumb.path} className="pl-crumb">{crumb.name}</Link>
                  {i < breadcrumbs.length - 1 && <ChevronRight size={12} className="pl-crumb-sep" />}
                </React.Fragment>
              ))}
            </nav>
          )}

          {/* Hero / Header */}
          <header className={`pl-header ${heroImage ? 'has-hero' : ''}`} style={heroImage ? { backgroundImage: `linear-gradient(to bottom, rgba(5,7,10,0.3), #05070a), url(${heroImage})` } : {}}>
            <div className="pl-header-inner">
              {label && (
                <div className="pl-kicker" style={{ background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}30` }}>
                  <span className="pl-kicker-dot" style={{ background: accentColor }} /> {label}
                </div>
              )}
              <h1 id="page-title" className="pl-title">{title}</h1>
              {subtitle && <p className="pl-subtitle">{subtitle}</p>}
              
              <div className="pl-meta-bar">
                {lastUpdated && (
                  <span className="pl-meta-item">
                    <Clock size={12} /> Updated {formatDate(lastUpdated)}
                  </span>
                )}
                <span className="pl-meta-item">{readingTime} min read</span>
                
                <div className="pl-actions">
                  <button onClick={handleShare} className="pl-action-btn" title="Share"><Share2 size={14} /></button>
                  <button onClick={handleCopyLink} className="pl-action-btn" title="Copy Link"><Copy size={14} /></button>
                  <button onClick={handlePrint} className="pl-action-btn" title="Print"><Printer size={14} /></button>
                  {actions}
                </div>
              </div>
            </div>
          </header>

          {/* Content & TOC Layout */}
          <div className="pl-body-wrapper">
            {headings.length > 2 && (
              <aside className="pl-toc" aria-label="Table of Contents">
                <div className="pl-toc-title">Contents</div>
                <ul>
                  {headings.map(h => (
                    <li key={h.id} className={`pl-toc-item ${h.tag === 'h3' ? 'sub' : ''}`}>
                      <a href={`#${h.id}`}>{h.text}</a>
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            <article ref={contentRef} className="pl-content">
              {children}
            </article>
          </div>

          {/* Bottom CTA */}
          {cta && (
            <div className="pl-cta-wrapper" style={{ borderColor: `${accentColor}30` }}>
              {cta}
            </div>
          )}
          
        </div>
      </main>
    </>
  );
}
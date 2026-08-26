import { useState, useEffect, useCallback, useRef, useMemo } from "react";

export default function PageLayout({
  children,
  title,
  subtitle,
  heroImage,
  heroBadge,
  author,
  authorAvatar,
  date,
  readTime,
  tags,
  headings,
  relatedContent,
}) {
  const [progress, setProgress] = useState(0);
  const [activeHeading, setActiveHeading] = useState("");
  const articleRef = useRef(null);

  const handleScroll = useCallback(() => {
    const el = articleRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scrolled = Math.max(0, -rect.top);
    const total = rect.height - window.innerHeight + 60;
    setProgress(total > 0 ? Math.min(100, (scrolled / total) * 100) : 0);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const headingIds = useMemo(() => (headings || []).map((h) => h.id), [headings]);

  useEffect(() => {
    if (!headingIds.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActiveHeading(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );
    headingIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [headingIds]);

  const hasToc = headings && headings.length > 0;

  return (
    <article className={`pl-layout${hasToc ? " pl-layout--with-toc" : ""}`}>
      <div className="pl-progress-bar" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
        <div className="pl-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {title && (
        <header className="pl-hero">
          {heroImage && (
            <>
              <div className="pl-hero-bg" style={{ backgroundImage: `url(${heroImage})` }} />
              <div className="pl-hero-overlay" />
            </>
          )}
          <div className="pl-hero-content">
            {heroBadge && <span className="pl-hero-badge">{heroBadge}</span>}
            <h1 className="pl-hero-title">{title}</h1>
            {subtitle && <p className="pl-hero-desc">{subtitle}</p>}
          </div>
        </header>
      )}

      {(author || date || readTime || tags?.length) && (
        <div className="pl-meta-bar">
          {author && (
            <span className="pl-meta-author">
              {authorAvatar && <img className="pl-meta-avatar" src={authorAvatar} alt={author} loading="lazy" />}
              {author}
            </span>
          )}
          {author && date && <span className="pl-meta-separator" />}
          {date && <time className="pl-meta-date" dateTime={date}>{new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time>}
          {date && readTime && <span className="pl-meta-separator" />}
          {readTime && <span className="pl-meta-read-time">⏱ {readTime}</span>}
          {tags?.length > 0 && (
            <div className="pl-meta-tags">
              {tags.map((t) => (
                <span key={t} className="pl-meta-tag">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="pl-main-content" ref={articleRef}>
        <div className="pl-article">
          {children}
        </div>

        {relatedContent && (
          <aside className="pl-related">
            <h2 className="pl-related-title">Related</h2>
            {relatedContent}
          </aside>
        )}
      </div>

      {hasToc && (
        <aside className="pl-toc-sidebar">
          <nav className="pl-toc" aria-label="Table of contents">
            <span className="pl-toc-title">On this page</span>
            {headings.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className={`pl-toc-link${activeHeading === h.id ? " pl-toc-link--active" : ""}`}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </aside>
      )}
    </article>
  );
}

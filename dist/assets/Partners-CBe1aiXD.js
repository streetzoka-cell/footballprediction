import{Nn as e,S as t,g as n,gt as r,jt as i,l as a,sn as o,wn as s,xn as c,zt as l}from"./react-vendor-DVxlqH4b.js";import{t as u}from"./index-DGKkuP7Q.js";var d=s(),f=()=>{if(document.getElementById(`co-partners-css`))return;let e=document.createElement(`style`);e.id=`co-partners-css`,e.textContent=`
@keyframes pa-fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes pa-pop{0%{transform:scale(.9);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}

.pa-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:80px}
.pa-wrap{max-width:700px;margin:0 auto;padding:0 18px}
.pa-hdr{position:sticky;top:0;z-index:100;padding:10px 0;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb, var(--bg-deep,#0a0f1a) 88%, transparent);border-bottom:1px solid var(--border)}
.pa-hdr-inner{display:flex;align-items:center;justify-content:space-between}
.pa-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.74rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
.pa-hdr-btn:hover{color:var(--text-primary);border-color:var(--border-hover)}
.pa-hdr-title{display:flex;align-items:center;gap:6px;font-size:.88rem;font-weight:800;color:var(--text-primary)}

.pa-hero{text-align:center;padding:36px 0 28px;animation:pa-fade-up .4s ease both}
.pa-hero h1{margin:0 0 6px;font-size:1.6rem;font-weight:900;color:var(--text-primary)}
.pa-hero p{margin:0;font-size:.84rem;color:var(--text-muted);font-weight:600;line-height:1.5;max-width:540px;margin-left:auto;margin-right:auto}

.pa-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:32px}
.pa-metric{background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:16px 10px;text-align:center;animation:pa-pop .35s cubic-bezier(.34,1.56,.64,1) both}
.pa-metric .n{font-size:1.4rem;font-weight:900;font-family:var(--font-display);line-height:1}
.pa-metric .l{font-size:.56rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:4px}

.pa-section-title{font-size:.88rem;font-weight:900;color:var(--text-primary);margin-bottom:14px}

.pa-opp{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:12px;animation:pa-fade-up .3s ease both}
.pa-opp:hover{border-color:var(--border-hover)}
.pa-opp h3{margin:0 0 8px;font-size:.92rem;font-weight:800;color:var(--text-primary);display:flex;align-items:center;gap:8px}
.pa-opp p{margin:0 0 12px;font-size:.8rem;color:var(--text-muted);font-weight:600;line-height:1.6}
.pa-opp-features{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.pa-opp-feat{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:.66rem;font-weight:700;background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-muted)}
.pa-opp-cta{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:10px;background:linear-gradient(135deg,var(--gold),#eab308);color:#000;font-size:.8rem;font-weight:800;border:none;cursor:pointer;transition:all .15s;font-family:inherit;box-shadow:0 2px 12px rgba(245,197,66,.18);text-decoration:none}
.pa-opp-cta:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(245,197,66,.22)}
.pa-opp-cta:active{transform:scale(.97)}

.pa-cta{text-align:center;padding:32px 20px;background:linear-gradient(135deg,rgba(245,197,66,.04),rgba(245,197,66,.01));border:1.5px solid rgba(245,197,66,.12);border-radius:16px;margin-top:24px;animation:pa-pop .4s cubic-bezier(.34,1.56,.64,1) both}
.pa-cta h3{margin:0 0 6px;font-size:.95rem;font-weight:900;color:var(--text-primary)}
.pa-cta p{margin:0 0 14px;font-size:.8rem;color:var(--text-muted);font-weight:600}

@media(max-width:480px){
  .pa-metrics{grid-template-columns:repeat(2,1fr)}
  .pa-hero h1{font-size:1.4rem}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `,document.head.appendChild(e)},p=[{n:`50K+`,l:`Monthly Users`,color:`var(--accent)`,delay:0},{n:`3M+`,l:`Page Views`,color:`#a855f7`,delay:60},{n:`12m`,l:`Avg. Session`,color:`var(--gold)`,delay:120}],m=[{title:`Sponsored Leaderboard`,icon:(0,d.jsx)(t,{size:16}),desc:`Brand your company on the daily, weekly, or G.O.A.T leaderboard. Seen by every user, every day.`,features:[`Logo placement`,`Custom branding`,`Dedicated leaderboard`,`Analytics dashboard`]},{title:`In-App Banner Ads`,icon:(0,d.jsx)(l,{size:16}),desc:`Display banners across predictions, fixtures, and leaderboard pages with precise targeting.`,features:[`Targeted by league`,`Targeted by country`,`Frequency capping`,`Click tracking`]},{title:`Match Page Sponsorship`,icon:(0,d.jsx)(o,{size:16}),desc:`Sponsor specific match prediction pages. Perfect for matchday promotions and betting partners.`,features:[`League targeting`,`Match type filtering`,`Clickable logo`,`Impression tracking`]},{title:`Content Partnership`,icon:(0,d.jsx)(n,{size:16}),desc:`Co-create prediction content, expert analysis, or branded Zoka Picks with your brand.`,features:[`Branded content`,`Social cross-posting`,`Expert co-hosting`,`Dedicated section`]}];function h(){f();let t=e();return(0,d.jsxs)(`div`,{className:`pa-page`,children:[(0,d.jsx)(u,{title:`Partner With ZOKASCORE | Sports Advertising`,description:`Promote your brand to over 50,000 engaged football fans with ZOKASCORE. Explore our sponsored leaderboards, in-app banner ads, and sports partnership deals.`,keywords:`sports partnerships, sponsor ZOKASCORE, football advertising, sports marketing, banner ads, sponsored leaderboards`,path:`/partners`,robots:`index,follow`}),(0,d.jsx)(`div`,{className:`pa-hdr`,children:(0,d.jsx)(`div`,{className:`pa-wrap`,children:(0,d.jsxs)(`div`,{className:`pa-hdr-inner`,children:[(0,d.jsxs)(`button`,{className:`pa-hdr-btn`,onClick:()=>t(`/`),children:[(0,d.jsx)(c,{size:13}),` Home`]}),(0,d.jsxs)(`div`,{className:`pa-hdr-title`,children:[(0,d.jsx)(i,{size:14}),` Partners`]})]})})}),(0,d.jsxs)(`div`,{className:`pa-wrap`,children:[(0,d.jsxs)(`div`,{className:`pa-hero`,children:[(0,d.jsxs)(`h1`,{children:[`Reach Football Fans`,(0,d.jsx)(`br`,{}),`Where They Predict`]}),(0,d.jsx)(`p`,{children:`ZokaPredict offers unique advertising opportunities to connect your brand with engaged football fans across Africa and beyond.`})]}),(0,d.jsx)(`div`,{className:`pa-metrics`,children:p.map((e,t)=>(0,d.jsxs)(`div`,{className:`pa-metric`,style:{animationDelay:`${e.delay+100}ms`},children:[(0,d.jsx)(`div`,{className:`n`,style:{color:e.color},children:e.n}),(0,d.jsx)(`div`,{className:`l`,children:e.l})]},t))}),(0,d.jsx)(`div`,{className:`pa-section-title`,children:`Partnership Opportunities`}),m.map((e,t)=>(0,d.jsxs)(`div`,{className:`pa-opp`,style:{animationDelay:`${t*60+200}ms`},children:[(0,d.jsxs)(`h3`,{children:[e.icon,` `,e.title]}),(0,d.jsx)(`p`,{children:e.desc}),(0,d.jsx)(`div`,{className:`pa-opp-features`,children:e.features.map(e=>(0,d.jsxs)(`span`,{className:`pa-opp-feat`,children:[(0,d.jsx)(a,{size:8}),` `,e]},e))}),(0,d.jsx)(`a`,{href:`mailto:streetzoka@gmail.com?subject=Partnership: ${e.title}`,style:{textDecoration:`none`},children:(0,d.jsxs)(`button`,{className:`pa-opp-cta`,children:[(0,d.jsx)(r,{size:13}),` Discuss This`]})})]},t)),(0,d.jsxs)(`div`,{className:`pa-cta`,children:[(0,d.jsx)(`h3`,{children:`Let's Build Something Great`}),(0,d.jsx)(`p`,{children:`Whether you're a brand, league, betting company, or media outlet — we'd love to explore how we can work together.`}),(0,d.jsx)(`a`,{href:`mailto:streetzoka@gmail.com?subject=Partnership Inquiry`,style:{textDecoration:`none`},children:(0,d.jsxs)(`button`,{className:`pa-opp-cta`,style:{padding:`12px 24px`,borderRadius:12,fontSize:`.85rem`},children:[(0,d.jsx)(i,{size:15}),` Get Our Media Kit`]})})]})]})]})}export{h as default};
import React, { useEffect, useState } from 'react';
export default function AppLoader(){
  const [p,setP]=useState(20);
  useEffect(()=>{const id=setInterval(()=>setP(v=> v<90 ? v+ Math.random()*12 : v),180); return()=>clearInterval(id);},[]);
  return(<div className="zoka-loader-container"><div className="zoka-loader-content">
    <div className="glass-card flex-center" style={{width:88, height:88, borderRadius:'var(--r-20)', margin:'0 auto 24px', background:'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(56,189,248,0.12)), var(--bg-card)', boxShadow:'0 16px 40px rgba(0,0,0,0.32), 0 0 32px rgba(16,185,129,0.18), inset 0 1px 0 rgba(255,255,255,0.14)'}}>
      <img src="/icons/icon-192.png" alt="ZOKA" width="56" height="56" style={{borderRadius:'var(--r-12)'}} />
    </div>
    <div style={{fontWeight:900, letterSpacing:'-0.02em', fontSize:'18px'}}>ZOKASCORE</div>
    <div className="zoka-loader-progress-outer" style={{width:140, marginTop:8}}><div className="zoka-loader-progress-inner" style={{width:`${p}%`, animation:'none', transition:'width 0.22s ease'}} /></div>
    <div className="text-muted text-xs" style={{marginTop:16, letterSpacing:'.14em', textTransform:'uppercase', fontWeight:800, opacity:0.8}}>Loading Midnight</div>
  </div></div>);
}

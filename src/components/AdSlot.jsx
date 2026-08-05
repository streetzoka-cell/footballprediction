import React from 'react';

export default function AdSlot({ id, mobile = true, desktop = true }) {
  // For now, return null to avoid layout shifts before AdSense approval
  return null;
  
  // After AdSense approval, replace with:
  /*
  return (
    <div 
      className={`ad-slot ${desktop && !mobile ? 'hidden-mobile' : ''} ${mobile && !desktop ? 'hidden-desktop' : ''}`} 
      style={{ margin: '16px 0', textAlign: 'center' }}
    >
      <ins className="adsbygoogle"
           style={{ display: 'block' }}
           data-ad-client="ca-pub-4820100355705138"
           data-ad-slot={id}
           data-ad-format="auto"
           data-full-width-responsive="true" />
    </div>
  );
  */
}
// footballprediction/src/app/transitions.jsx

import { useLocation } from "react-router-dom";

export default function PageTransition({ children }) {
  const location = useLocation();
  
  return (
    <div 
      key={location.pathname} 
      className="page-transition-wrapper"
      style={{ animation: 'zoka-page-enter 0.25s cubic-bezier(0.22, 1, 0.36, 1) both' }}
    >
      {children}
    </div>
  );
}

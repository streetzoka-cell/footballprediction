import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function PageTransition({ children }) {
  const { pathname } = useLocation();

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);

    const t = setTimeout(() => setVisible(true), 30);

    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <div className={`page-transition-wrapper ${visible ? 'page-transition-visible' : 'page-transition-hidden'}`}>
      {children}
    </div>
  );
}
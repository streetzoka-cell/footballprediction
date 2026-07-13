import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function PageTransition({
  children,
}) {
  const { pathname } = useLocation();

  const [visible, setVisible] =
    useState(false);

  useEffect(() => {
    setVisible(false);

    const t = setTimeout(
      () => setVisible(true),
      30
    );

    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateY(0)"
          : "translateY(12px)",

        transition:
          "opacity .25s ease, transform .25s ease",

        minHeight: "80vh",
      }}
    >
      {children}
    </div>
  );
}
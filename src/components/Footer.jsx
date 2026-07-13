// src/components/Footer.jsx

import { Link } from "react-router-dom";

const year = new Date().getFullYear();

const sections = [
  {
    title: "Sports",
    links: [
      ["Live Scores", "/"],
      ["Fixtures", "/fixtures"],
      ["Predictions", "/predictions"],
      ["Basketball", "/basketball"],
      ["Highlights", "/highlights"],
      ["Leaderboard", "/leaderboard"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Partners", "/partners"],
      ["Advertise", "/advertise"],
      ["Careers", "/careers"],
    ],
  },
  {
    title: "Support",
    links: [
      ["Help Center", "/help"],
      ["FAQ", "/faq"],
      ["Status", "/status"],
      ["Changelog", "/changelog"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy Policy", "/privacy"],
      ["Terms", "/terms"],
      ["Cookies", "/cookies"],
      ["Disclaimer", "/disclaimer"],
    ],
  },
];

export default function Footer() {
  return (
    <footer
      style={{
        background: "#08121d",
        borderTop: "1px solid rgba(255,255,255,.08)",
        marginTop: 60,
      }}
    >
      <div
        style={{
          maxWidth: 1300,
          margin: "0 auto",
          padding: "60px 20px 30px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(180px,1fr))",
            gap: 40,
          }}
        >
          <div>
            <h2
              style={{
                marginTop: 0,
                marginBottom: 15,
              }}
            >
              ⚽ ZOKASCORE
            </h2>

            <p
              style={{
                color: "#a9b7c6",
                lineHeight: 1.8,
              }}
            >
              Live football scores, fixtures,
              predictions, standings, basketball,
              statistics and sports updates.
            </p>
          </div>

          {sections.map((section) => (
            <div key={section.title}>
              <h3>{section.title}</h3>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {section.links.map(([label, url]) => (
                  <Link
                    key={url}
                    to={url}
                    style={{
                      color: "#b8c4d6",
                      textDecoration: "none",
                    }}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 50,
            paddingTop: 25,
            borderTop:
              "1px solid rgba(255,255,255,.08)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            color: "#8fa2b5",
            fontSize: ".9rem",
          }}
        >
          <span>
            © {year} ZOKASCORE. All rights reserved.
          </span>

          <span>
            Founded & Developed by{" "}
            <strong>Kimutai Gibson</strong>
          </span>

          <span>Version 2.0.0</span>
        </div>
      </div>
    </footer>
  );
}
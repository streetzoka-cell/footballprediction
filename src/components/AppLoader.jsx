import { useEffect, useState } from "react";

export default function AppLoader() {
  const messages = [
    "Loading today's fixtures...",
    "Fetching live scores...",
    "Preparing predictions...",
    "Updating league tables...",
    "Checking today's matches...",
    "Finding trending fixtures...",
    "Loading basketball games...",
    "Connecting to live servers...",
    "Almost kick-off...",
    "Welcome to ZOKASCORE",
  ];

  const [message, setMessage] = useState(messages[0]);
  const [progress, setProgress] = useState(10);
  const [rotate, setRotate] = useState(0);

  useEffect(() => {
    document.title = "⚽ Loading... | ZOKASCORE";

    const messageTimer = setInterval(() => {
      setMessage((current) => {
        const index = messages.indexOf(current);
        return messages[(index + 1) % messages.length];
      });
    }, 2000);

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        return prev + Math.floor(Math.random() * 7) + 2;
      });
    }, 500);

    const ballTimer = setInterval(() => {
      setRotate((prev) => prev + 40);
    }, 1500);

    return () => {
      clearInterval(messageTimer);
      clearInterval(progressTimer);
      clearInterval(ballTimer);
    };
  }, []);

  return (
    <div className="zoka-loader-container">
      <div className="zoka-loader-content">
        <div className="zoka-loader-live-badge">
          <span className="zoka-loader-dot"></span>
          LIVE
        </div>

        <div
          className="zoka-loader-ball"
          style={{ transform: `translateY(-10px) rotate(${rotate}deg)` }}
        >
          ⚽
        </div>

        <h1 className="zoka-loader-logo">ZOKASCORE</h1>
        <p className="zoka-loader-text">{message}</p>

        <div className="zoka-loader-progress-outer">
          <div
            className="zoka-loader-progress-inner"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="zoka-loader-tagline">
          LIVE SCORES • PREDICTIONS • LEADERBOARD
        </p>
      </div>
    </div>
  );
}
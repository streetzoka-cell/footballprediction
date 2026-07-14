# ═══════════════════════════════════════════════════════════════════════════════
# FILE: README.md
# ═══════════════════════════════════════════════════════════════════════════════

<div align="center">
  <img src="public/icon.svg" alt="ZokaPredict" width="80" height="80" style="border-radius:16px" />
  
  # ⚽ ZokaPredict
  
  **Real-time football prediction platform for fans who know the game.**
  
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![Platform: Web](https://img.shields.io/badge/platform-Web-green.svg)
  [![Framework: React](https://img.shields.io/badge/framework-React-61dafb.svg)
  [![Backend: Firebase](https://img.shields.io/badge/backend-Firebase-ffca28.svg)
</div>

---

## 🎯 About

ZokaPredict is a real-time football prediction platform where fans compete on daily, weekly, monthly, and all-time leaderboards. Make score predictions, track accuracy, climb the rankings, and prove you know the beautiful game better than anyone else.

**Built with ❤️ in Nairobi, Kenya**

## ✨ Features

- **🎯 Featured Predictions** — Admin-selected matches for daily competition
- **⭐ Zoka Picks** — Expert predictions with community voting (agree/disagree)
- **🏆 Multi-period Leaderboards** — Daily, Weekly, Monthly, and G.O.A.T (all-time)
- **📊 Real-time Scoring** — Instant results and leaderboard updates via Firebase
- **🔴 Live Match Tracking** — Follow live scores with pulse animations
- **🎯 Score Steppers** — Intuitive +/- buttons for score input
- **🔍 League Filtering** — Filter matches by competition
- **📈 Accuracy Tracking** — Exact scores (10pts), correct results (3pts), misses
- **📺 Live Streaming** — Integrated football live streams
- **📰 Highlights** — Match highlights and analysis
- **🏀 Basketball** — Extended support for NBA predictions
- **🔧 Admin Panel** — Full match management, scoring, and leaderboard rebuild tools

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18+, React Router v6 |
| Styling | CSS Custom Properties, Component-scoped styles |
| Backend | Firebase Firestore, Cloud Functions |
| Auth | Firebase Authentication (Email/Password, Google) |
| Data | Football-Data.org API (real-time match data) |
| Hosting | Vercel (frontend) |
| CDN | Cloudflare |
| Icons | Lucide React |
| SEO | Custom SEO component with dynamic meta tags |

## 📁 Project Structure
src/
├── app/ # App routes and layout
├── components/ # Reusable UI components
│ └── SEO.jsx # Dynamic SEO meta tags
├── config/ # Firebase configuration
│ └── footballFirebase.jsx
├── context/ # React Context providers
│ ├── AuthContext.jsx # Authentication state
│ ├── FootballDataContext.jsx # Live match data
│ └── AppDataContext.jsx # App-wide data
├── hooks/ # Custom React hooks
│ └── useMatchData.js # Prediction scoring & leaderboard logic
├── pages/ # Route pages
│ ├── Home.jsx # Landing page
│ ├── Predictions.jsx # Main prediction interface
│ ├── Leaderboard.jsx # Rankings with podium
│ ├── Admin.jsx # Admin control panel
│ ├── Fixtures.jsx # Match schedule
│ ├── LiveStream.jsx # Live stream viewer
│ ├── Highlights.jsx # Match highlights
│ ├── Basketball.jsx # NBA predictions
│ ├── company/ # Company pages
│ │ ├── About.jsx
│ │ ├── Contact.jsx
│ │ ├── Careers.jsx
│ │ ├── Partners.jsx
│ │ ├── Advertise.jsx
│ │ └── Team.jsx
│ └── system/ # System pages
│ ├── Status.jsx
│ └── Changelog.jsx
├── services/ # External API services
│ ├── footballApi.js # Football-Data.org wrapper
│ └── footballFirestore.js # Firestore data access
├── utils/ # Utilities
│ ├── api.js # API configuration
│ ├── constants.js # App constants & paths
│ ├── dataLayer.js # Cached data access layer
│ ├── dates.js # Date utilities
│ ├── eventBus.js # Event system for reactive updates
│ ├── firebase.js # Firebase initialization
│ ├── preload.js # Asset preloading
│ ├── schema.js # Data schemas
│ └── seo.js # SEO helpers
└── styles/ # Global styles
├── global.css
└── common.js

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A Firebase project with Firestore enabled
- Football-Data.org API key

### Installation

```bash
# Clone the repository
git clone https://github.com/streetzoka/zokapredict.git
cd zokapredict

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Firebase and API credentials

# Start development server
npm run dev
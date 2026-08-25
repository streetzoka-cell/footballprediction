import { Routes, Route } from "react-router-dom";
import { ROUTES, STUDIO_ROUTES } from "../utils/routes";

import { AdminRoute } from "./guards";

// Import centralized lazy routes
import { 
  Home, Fixtures, Results, Predictions, PredictionV21, MasterGames, 
  Basketball, Highlights, HighlightDetail, HighlightAuthor, Livestream, 
  Leaderboard, Profile, Login, About, Privacy, Terms, FAQ, HelpCenter, 
  Search, Careers, Contact, Partners, Advertise, Team, Changelog, Status, 
  FootballKnowledge, FootballLawDetail, MatchDetail, LeagueDetail, TeamDetail, 
  StudioHome, StudioTemplates, StudioEditor, StudioReactor, StudioWebShowcase, 
  StudioMedia, StudioFaceAR, Admin, NotFound 
} from "./routes";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.HOME} element={<Home />} />
      <Route path={ROUTES.FIXTURES} element={<Fixtures />} />
      <Route path={ROUTES.RESULTS} element={<Results />} />
      <Route path={ROUTES.PREDICTIONS} element={<Predictions />} />
      <Route path={ROUTES.PREDICTION_V21} element={<PredictionV21 />} />
      <Route path={ROUTES.MASTERGAMES} element={<MasterGames />} />
      <Route path={ROUTES.BASKETBALL} element={<Basketball />} />
      <Route path={ROUTES.HIGHLIGHTS} element={<Highlights />} />
      <Route path="/highlights/:highlightId/:slug" element={<HighlightDetail />} />
      <Route path="/highlights/author/:author" element={<HighlightAuthor />} />
      <Route path={ROUTES.LIVESTREAM} element={<Livestream />} />
      <Route path={ROUTES.LEADERBOARD} element={<Leaderboard />} />
      <Route path={ROUTES.PROFILE} element={<Profile />} />
      <Route path="/profile/:uid" element={<Profile />} />
      <Route path={ROUTES.LOGIN} element={<Login />} />
      <Route path={ROUTES.ABOUT} element={<About />} />
      <Route path={ROUTES.PRIVACY} element={<Privacy />} />
      <Route path={ROUTES.TERMS} element={<Terms />} />
      <Route path={ROUTES.FAQ} element={<FAQ />} />
      <Route path={ROUTES.HELP} element={<HelpCenter />} />
      <Route path={ROUTES.SEARCH} element={<Search />} />
      <Route path={ROUTES.CAREERS} element={<Careers />} />
      <Route path={ROUTES.CONTACT} element={<Contact />} />
      <Route path={ROUTES.PARTNERS} element={<Partners />} />
      <Route path={ROUTES.ADVERTISE} element={<Advertise />} />
      <Route path={ROUTES.TEAM} element={<Team />} />

      <Route path="/match/:matchId/:slug" element={<MatchDetail />} />
      <Route path="/league/:leagueId/:slug" element={<LeagueDetail />} />
      <Route path="/team/:teamId/:slug" element={<TeamDetail />} />

      <Route path={ROUTES.FOOTBALL_KNOWLEDGE} element={<FootballKnowledge />} />
      <Route path="/football-knowledge/laws/:lawId" element={<FootballLawDetail />} />

      <Route path={STUDIO_ROUTES.HOME} element={<StudioHome />} />
      <Route path={STUDIO_ROUTES.TEMPLATES} element={<StudioTemplates />} />
      <Route path={STUDIO_ROUTES.EDITOR} element={<StudioEditor />} />
      <Route path={STUDIO_ROUTES.REACTOR} element={<StudioReactor />} />
      <Route path={STUDIO_ROUTES.WEB_SHOWCASE} element={<StudioWebShowcase />} />
      <Route path={STUDIO_ROUTES.MEDIA} element={<StudioMedia />} />
      <Route path={STUDIO_ROUTES.FACE_AR} element={<StudioFaceAR />} />

      <Route path={ROUTES.CHANGELOG} element={<Changelog />} />
      <Route path={ROUTES.STATUS} element={<Status />} />

      <Route
        path={ROUTES.ADMIN}
        element={<AdminRoute><Admin /></AdminRoute>}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
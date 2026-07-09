
const LEAGUES = {
  PL: { name: 'Premier League', color: '#3d195b' },
  LL: { name: 'La Liga', color: '#ee8707' },
  SA: { name: 'Serie A', color: '#024494' },
  BL: { name: 'Bundesliga', color: '#d20515' },
  L1: { name: 'Ligue 1', color: '#091c3e' },
  UCL: { name: 'Champions League', color: '#14213d' },
  EL: { name: 'Europa League', color: '#b56a2d' }
};

const TEAMS = {
  ARS: { name: 'Arsenal', abbr: 'ARS', color: '#ef0107' },
  CHE: { name: 'Chelsea', abbr: 'CHE', color: '#034694' },
  MCI: { name: 'Man City', abbr: 'MCI', color: '#6cabdd' },
  LIV: { name: 'Liverpool', abbr: 'LIV', color: '#c8102e' },
  MUN: { name: 'Man United', abbr: 'MUN', color: '#da291c' },
  TOT: { name: 'Tottenham', abbr: 'TOT', color: '#132257' },
  NEW: { name: 'Newcastle', abbr: 'NEW', color: '#241f20' },
  AVL: { name: 'Aston Villa', abbr: 'AVL', color: '#670e36' },
  BHA: { name: 'Brighton', abbr: 'BHA', color: '#0057b8' },
  WHU: { name: 'West Ham', abbr: 'WHU', color: '#7a263a' },
  RMA: { name: 'Real Madrid', abbr: 'RMA', color: '#febe10' },
  BAR: { name: 'Barcelona', abbr: 'BAR', color: '#a50044' },
  ATM: { name: 'Atletico Madrid', abbr: 'ATM', color: '#272e61' },
  BAY: { name: 'Bayern Munich', abbr: 'BAY', color: '#dc052d' },
  DOR: { name: 'Dortmund', abbr: 'DOR', color: '#fde100' },
  JUV: { name: 'Juventus', abbr: 'JUV', color: '#000000' },
  INT: { name: 'Inter Milan', abbr: 'INT', color: '#009bdd' },
  MIL: { name: 'AC Milan', abbr: 'MIL', color: '#fb090b' },
  NAP: { name: 'Napoli', abbr: 'NAP', color: '#12a0d7' },
  PSG: { name: 'Paris Saint-Germain', abbr: 'PSG', color: '#004170' },
  OL: { name: 'Lyon', abbr: 'OL', color: '#1a56a4' },
  FUL: { name: 'Fulham', abbr: 'FUL', color: '#000000' },
  WOL: { name: 'Wolves', abbr: 'WOL', color: '#fdb913' },
  BOU: { name: 'Bournemouth', abbr: 'BOU', color: '#da291c' },
  CRY: { name: 'Crystal Palace', abbr: 'CRY', color: '#1b458f' },
  EVE: { name: 'Everton', abbr: 'EVE', color: '#003399' },
  NFO: { name: 'Nottm Forest', abbr: 'NFO', color: '#dd0000' },
  BRE: { name: 'Brentford', abbr: 'BRE', color: '#e30613' },
  CEL: { name: 'Celtic', abbr: 'CEL', color: '#007a3d' },
  RBL: { name: 'RB Leipzig', abbr: 'RBL', color: '#dd0741' }
};

function makePrediction(home, away, league, hScore, aScore, hProb, dProb, aProb, hOdds, dOdds, aOdds, status, dateStr) {
  const hp = Math.round(hProb * 100);
  const dp = Math.round(dProb * 100);
  const ap = Math.round(aProb * 100);
  return {
    id: home + '-' + away + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    homeTeam: TEAMS[home],
    awayTeam: TEAMS[away],
    league: LEAGUES[league],
    leagueKey: league,
    date: dateStr || new Date().toISOString(),
    predictedHomeScore: hScore,
    predictedAwayScore: aScore,
    homeWinProb: hp,
    drawProb: dp,
    awayWinProb: ap,
    homeOdds: hOdds.toFixed(2),
    drawOdds: dOdds.toFixed(2),
    awayOdds: aOdds.toFixed(2),
    actualHomeScore: status === 'completed' ? hScore : null,
    actualAwayScore: status === 'completed' ? aScore : null,
    status: status
  };
}

export const mockPredictions = [
  makePrediction('ARS', 'CHE', 'PL', 2, 1, 0.52, 0.24, 0.24, 1.85, 3.40, 3.90, 'upcoming', '2025-01-20T15:00:00Z'),
  makePrediction('MCI', 'LIV', 'PL', 1, 1, 0.38, 0.28, 0.34, 2.50, 3.30, 2.80, 'upcoming', '2025-01-20T17:30:00Z'),
  makePrediction('MUN', 'TOT', 'PL', 2, 2, 0.34, 0.26, 0.40, 2.80, 3.50, 2.45, 'upcoming', '2025-01-20T20:00:00Z'),
  makePrediction('NEW', 'AVL', 'PL', 3, 1, 0.58, 0.22, 0.20, 1.65, 3.80, 4.50, 'upcoming', '2025-01-21T20:00:00Z'),
  makePrediction('BHA', 'WHU', 'PL', 1, 0, 0.48, 0.26, 0.26, 2.00, 3.40, 3.60, 'upcoming', '2025-01-21T20:00:00Z'),
  makePrediction('RMA', 'BAR', 'LL', 2, 1, 0.45, 0.26, 0.29, 2.15, 3.30, 3.20, 'upcoming', '2025-01-21T21:00:00Z'),
  makePrediction('BAY', 'DOR', 'BL', 3, 2, 0.55, 0.22, 0.23, 1.75, 3.70, 4.10, 'upcoming', '2025-01-22T20:30:00Z'),
  makePrediction('JUV', 'INT', 'SA', 1, 1, 0.32, 0.30, 0.38, 2.90, 3.10, 2.50, 'upcoming', '2025-01-22T20:45:00Z'),
  makePrediction('PSG', 'OL', 'L1', 3, 0, 0.72, 0.16, 0.12, 1.35, 5.20, 7.50, 'upcoming', '2025-01-22T21:00:00Z'),
  makePrediction('FUL', 'WOL', 'PL', 1, 1, 0.42, 0.28, 0.30, 2.30, 3.20, 3.10, 'upcoming', '2025-01-22T19:30:00Z'),
  makePrediction('BOU', 'CRY', 'PL', 2, 0, 0.46, 0.26, 0.28, 2.10, 3.40, 3.40, 'completed', '2025-01-18T15:00:00Z'),
  makePrediction('EVE', 'NFO', 'PL', 1, 0, 0.40, 0.30, 0.30, 2.45, 3.10, 2.90, 'completed', '2025-01-18T15:00:00Z'),
  makePrediction('ATM', 'CEL', 'UCL', 2, 1, 0.50, 0.26, 0.24, 1.90, 3.50, 3.80, 'completed', '2025-01-17T21:00:00Z'),
  makePrediction('MIL', 'NAP', 'SA', 1, 2, 0.35, 0.26, 0.39, 2.70, 3.30, 2.55, 'completed', '2025-01-17T20:45:00Z'),
  makePrediction('RBL', 'BRE', 'EL', 3, 1, 0.60, 0.22, 0.18, 1.60, 4.00, 5.00, 'completed', '2025-01-16T21:00:00Z')
];

export const mockLeaderboard = [
  { uid: 'u1', displayName: 'PredictionKing', points: 247, predictions: 85, correctScore: 22, correctResult: 48, accuracy: 82.4 },
  { uid: 'u2', displayName: 'FootyOracle', points: 231, predictions: 82, correctScore: 19, correctResult: 47, accuracy: 80.5 },
  { uid: 'u3', displayName: 'MatchDayPro', points: 219, predictions: 78, correctScore: 20, correctResult: 43, accuracy: 80.8 },
  { uid: 'u4', displayName: 'GoalGuru99', points: 198, predictions: 80, correctScore: 16, correctResult: 42, accuracy: 72.5 },
  { uid: 'u5', displayName: 'TacticalTipster', points: 187, predictions: 76, correctScore: 15, correctResult: 40, accuracy: 72.4 },
  { uid: 'u6', displayName: 'CleanSheetClub', points: 176, predictions: 74, correctScore: 14, correctResult: 38, accuracy: 70.3 },
  { uid: 'u7', displayName: 'SetPieceAnalyst', points: 165, predictions: 72, correctScore: 13, correctResult: 36, accuracy: 68.1 },
  { uid: 'u8', displayName: 'OffsideTrap', points: 154, predictions: 70, correctScore: 12, correctResult: 34, accuracy: 65.7 },
  { uid: 'u9', displayName: 'CounterAttack', points: 143, predictions: 68, correctScore: 11, correctResult: 32, accuracy: 63.2 },
  { uid: 'u10', displayName: 'BoxToBox', points: 132, predictions: 66, correctScore: 10, correctResult: 30, accuracy: 60.6 },
  { uid: 'u11', displayName: 'DeadBallSpec', points: 121, predictions: 64, correctScore: 9, correctResult: 28, accuracy: 57.8 },
  { uid: 'u12', displayName: 'WingPlay', points: 110, predictions: 60, correctScore: 8, correctResult: 26, accuracy: 56.7 },
  { uid: 'u13', displayName: 'PressingHigh', points: 99, predictions: 58, correctScore: 7, correctResult: 24, accuracy: 53.4 },
  { uid: 'u14', displayName: 'LowBlockDef', points: 88, predictions: 56, correctScore: 6, correctResult: 22, accuracy: 50.0 },
  { uid: 'u15', displayName: 'LongBallFC', points: 77, predictions: 54, correctScore: 5, correctResult: 20, accuracy: 46.3 }
];

export const mockHighlights = [
  { id: 'h1', title: 'Arsenal 2-1 Chelsea - Premier League Highlights', league: 'PL', videoId: 'dQw4w9WgXcQ' },
  { id: 'h2', title: 'Real Madrid 3-2 Barcelona - El Clasico Recap', league: 'LL', videoId: 'dQw4w9WgXcQ' },
  { id: 'h3', title: 'Bayern Munich 4-1 Dortmund - Der Klassiker', league: 'BL', videoId: 'dQw4w9WgXcQ' },
  { id: 'h4', title: 'Juventus 1-1 Inter Milan - Derby d Italia', league: 'SA', videoId: 'dQw4w9WgXcQ' },
  { id: 'h5', title: 'PSG 3-0 Lyon - Ligue 1 Highlights', league: 'L1', videoId: 'dQw4w9WgXcQ' },
  { id: 'h6', title: 'Man City 2-2 Liverpool - Thrilling Draw', league: 'PL', videoId: 'dQw4w9WgXcQ' },
  { id: 'h7', title: 'Celtic 1-2 Atletico Madrid - UCL Highlights', league: 'UCL', videoId: 'dQw4w9WgXcQ' },
  { id: 'h8', title: 'AC Milan 1-2 Napoli - Serie A Recap', league: 'SA', videoId: 'dQw4w9WgXcQ' }
];

export const mockFixtures = [
  { id: 'f1', homeTeam: TEAMS['ARS'], awayTeam: TEAMS['CHE'], league: LEAGUES['PL'], date: '2025-01-20T15:00:00Z', status: 'TIMED', homeScore: null, awayScore: null },
  { id: 'f2', homeTeam: TEAMS['MCI'], awayTeam: TEAMS['LIV'], league: LEAGUES['PL'], date: '2025-01-20T17:30:00Z', status: 'TIMED', homeScore: null, awayScore: null },
  { id: 'f3', homeTeam: TEAMS['MUN'], awayTeam: TEAMS['TOT'], league: LEAGUES['PL'], date: '2025-01-20T20:00:00Z', status: 'TIMED', homeScore: null, awayScore: null },
  { id: 'f4', homeTeam: TEAMS['NEW'], awayTeam: TEAMS['AVL'], league: LEAGUES['PL'], date: '2025-01-21T20:00:00Z', status: 'TIMED', homeScore: null, awayScore: null },
  { id: 'f5', homeTeam: TEAMS['BHA'], awayTeam: TEAMS['WHU'], league: LEAGUES['PL'], date: '2025-01-21T20:00:00Z', status: 'TIMED', homeScore: null, awayScore: null },
  { id: 'f6', homeTeam: TEAMS['RMA'], awayTeam: TEAMS['BAR'], league: LEAGUES['LL'], date: '2025-01-21T21:00:00Z', status: 'TIMED', homeScore: null, awayScore: null },
  { id: 'f7', homeTeam: TEAMS['BAY'], awayTeam: TEAMS['DOR'], league: LEAGUES['BL'], date: '2025-01-22T20:30:00Z', status: 'TIMED', homeScore: null, awayScore: null },
  { id: 'f8', homeTeam: TEAMS['JUV'], awayTeam: TEAMS['INT'], league: LEAGUES['SA'], date: '2025-01-22T20:45:00Z', status: 'TIMED', homeScore: null, awayScore: null },
  { id: 'f9', homeTeam: TEAMS['PSG'], awayTeam: TEAMS['OL'], league: LEAGUES['L1'], date: '2025-01-22T21:00:00Z', status: 'TIMED', homeScore: null, awayScore: null },
  { id: 'f10', homeTeam: TEAMS['BOU'], awayTeam: TEAMS['CRY'], league: LEAGUES['PL'], date: '2025-01-18T15:00:00Z', status: 'FINISHED', homeScore: 2, awayScore: 0 },
  { id: 'f11', homeTeam: TEAMS['EVE'], awayTeam: TEAMS['NFO'], league: LEAGUES['PL'], date: '2025-01-18T15:00:00Z', status: 'FINISHED', homeScore: 1, awayScore: 0 },
  { id: 'f12', homeTeam: TEAMS['ATM'], awayTeam: TEAMS['CEL'], league: LEAGUES['UCL'], date: '2025-01-17T21:00:00Z', status: 'FINISHED', homeScore: 2, awayScore: 1 }
];

export const MOCK_BADGES = [
  { id: 'newcomer', name: 'Newcomer', icon: 'seedling', color: '#4ade80', desc: 'Joined the platform' },
  { id: 'first-pred', name: 'First Pick', icon: 'target', color: '#60a5fa', desc: 'Made first prediction' },
  { id: 'streak-3', name: 'Hot Streak', icon: 'flame', color: '#f97316', desc: '3 correct results in a row' },
  { id: 'exact-5', name: 'Sharpshooter', icon: 'crosshair', color: '#a78bfa', desc: '5 exact score predictions' },
  { id: 'top-10', name: 'Top 10', icon: 'trophy', color: '#fbbf24', desc: 'Reached top 10 on leaderboard' },
  { id: 'centurion', name: 'Centurion', icon: 'hundred', color: '#f43f5e', desc: 'Made 100 predictions' },
  { id: 'ucl-expert', name: 'UCL Expert', icon: 'star', color: '#1e40af', desc: '80%+ accuracy in UCL predictions' },
  { id: 'weekend-warrior', name: 'Weekend Warrior', icon: 'calendar', color: '#14b8a6', desc: 'Predicted 10 weekend matches' }
];

export { LEAGUES, TEAMS };
const { z } = require('zod');

// Domain Model: Match (Flat structure aligned with backend writes)
const MatchSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  sport: z.string().default('football'),
  date: z.string().nullable().optional(),
  timestamp: z.number().nullable().optional(),
  status: z.string().default('NS'),
  statusLong: z.string().optional(),
  elapsed: z.number().nullable().optional(),
  
  homeTeamId: z.union([z.string(), z.number()]).transform(String).optional(),
  homeTeamName: z.string().default('TBD'),
  homeTeamLogo: z.string().nullable().optional(),
  homeTeamCrest: z.string().nullable().optional(),

  awayTeamId: z.union([z.string(), z.number()]).transform(String).optional(),
  awayTeamName: z.string().default('TBD'),
  awayTeamLogo: z.string().nullable().optional(),
  awayTeamCrest: z.string().nullable().optional(),

  homeScore: z.number().nullable().optional(),
  awayScore: z.number().nullable().optional(),
  goalsHome: z.number().nullable().optional(),
  goalsAway: z.number().nullable().optional(),
  
  leagueId: z.union([z.string(), z.number()]).transform(String).optional(),
  leagueName: z.string().default('Other'),
  leagueCountry: z.string().optional(),
  leagueLogo: z.string().nullable().optional(),
  leagueEmblem: z.string().nullable().optional(),
  leagueFlag: z.string().nullable().optional(),
  season: z.number().optional(),
  round: z.string().optional(),
  
  score: z.object({
    halftime: z.object({ home: z.number().nullable(), away: z.number().nullable() }).optional(),
    fulltime: z.object({ home: z.number().nullable(), away: z.number().nullable() }).optional(),
  }).optional(),

  // ★ NEW INTELLIGENCE FIELDS ★
  matchScore: z.number().default(0),
  category: z.string().default('NORMAL'),
});

function validateMatch(raw) {
  const result = MatchSchema.safeParse(raw);
  if (result.success) {
    const data = result.data;
    // Map crest to logo for frontend consistency
    if (!data.homeTeamLogo && data.homeTeamCrest) data.homeTeamLogo = data.homeTeamCrest;
    if (!data.awayTeamLogo && data.awayTeamCrest) data.awayTeamLogo = data.awayTeamCrest;
    if (!data.leagueLogo && data.leagueEmblem) data.leagueLogo = data.leagueEmblem;
    return data;
  }
  return null;
}

module.exports = { MatchSchema, validateMatch };
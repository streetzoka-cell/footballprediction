// api/v1/_schemas.js
import { z } from 'zod';

// ★ Domain Model: Match (Aligned with flat backend structure)
export const MatchSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  sport: z.string().default('football'),
  date: z.string().nullable().optional(),
  timestamp: z.number().nullable().optional(),
  status: z.string().default('NS'),
  statusLong: z.string().optional(),
  elapsed: z.number().nullable().optional(),
  minute: z.number().nullable().optional(),
  
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

/**
 * Validates and maps raw data to the Domain Model.
 * If data is malformed, it returns null (rejecting the bad data).
 */
export function validateMatch(raw) {
  const result = MatchSchema.safeParse(raw);
  if (result.success) {
    // Return the validated data. The frontend's normalizeMatch() function 
    // is already designed to handle these flat fields perfectly.
    return result.data;
  }
  return null;
}

export const CompetitionSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  code: z.string().nullable().optional(),
  emblem: z.string().nullable().optional(),
  area: z.object({
    name: z.string().optional(),
    flag: z.string().nullable().optional(),
  }).optional(),
});

export function validateCompetition(raw) {
  const result = CompetitionSchema.safeParse(raw);
  return result.success ? result.data : null;
}
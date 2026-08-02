const normalizeStandings = (data) => {
  if (!data || !data.standings || data.standings.length === 0) return null;

  const totalStandings =
    data.standings.find((s) => s.type === 'TOTAL') || data.standings[0];

  const standingsTable = totalStandings.table.map((row) => ({
    rank: row.position,
    team: {
      id: String(row.team.id),
      name: row.team.name,
      logo: row.team.crest,
    },
    points: row.points,
    goalsDiff: row.goalDifference,
    all: {
      played: row.playedGames,
      win: row.won,
      draw: row.draw,
      lose: row.lost,
      goals: {
        for: row.goalsFor,
        against: row.goalsAgainst,
      },
    },
  }));

  return {
    id: String(data.competition.code || data.competition.id),
    name: data.competition.name,
    country: data.area.name,
    logo: null,
    season: data.season.startDate.split('-')[0],
    standings: [standingsTable],
  };
};

const normalizeTeams = (data) => {
  if (!data || !data.teams) return [];

  return data.teams.map((t) => ({
    id: String(t.id),
    name: t.name,
    logo: t.crest,
    country: t.area?.name || null,
    founded: t.founded,
    venue: t.venue || null,
  }));
};

module.exports = {
  normalizeStandings,
  normalizeTeams,
};
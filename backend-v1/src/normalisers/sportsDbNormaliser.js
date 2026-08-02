const normalizeTeam = (data) => {
  if (!data) return null;

  return {
    id: String(data.idTeam || ''),
    name: data.strTeam || 'TBD',
    logo: data.strBadge || data.strLogo || null,
    country: data.strCountry || null,
    founded: data.intFormedYear ? parseInt(data.intFormedYear, 10) : null,
    venue: data.strStadium || null,
    venueCity: data.strStadiumLocation || null,
    description: data.strDescriptionEN || null,
  };
};

const normalizeLeague = (data) => {
  if (!data) return null;

  return {
    id: String(data.idLeague || ''),
    name: data.strLeague || 'Unknown',
    sport: data.strSport || 'Soccer',
    logo: data.strBadge || data.strLogo || null,
    country: data.strCountry || null,
    description: data.strDescriptionEN || null,
  };
};

module.exports = {
  normalizeTeam,
  normalizeLeague,
};
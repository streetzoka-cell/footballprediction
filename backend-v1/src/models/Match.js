/**
 * @typedef {Object} Match
 * @property {string} id
 * @property {string} sport
 * @property {string} date - ISO Date string
 * @property {number} timestamp - Unix timestamp
 * @property {string} status - Short status (e.g., '1H', 'FT', 'NS')
 * @property {string} statusLong - Long status (e.g., 'IN_PLAY')
 * @property {number|null} elapsed
 * @property {number|null} minute
 * @property {string} homeTeamId
 * @property {string} homeTeamName
 * @property {string|null} homeTeamLogo
 * @property {string|null} homeTeamCrest
 * @property {string} awayTeamId
 * @property {string} awayTeamName
 * @property {string|null} awayTeamLogo
 * @property {string|null} awayTeamCrest
 * @property {number|null} homeScore
 * @property {number|null} awayScore
 * @property {number|null} goalsHome
 * @property {number|null} goalsAway
 * @property {string} leagueId
 * @property {string} leagueName
 * @property {string|null} leagueCountry
 * @property {string|null} leagueLogo
 * @property {string|null} leagueEmblem
 * @property {string|null} leagueFlag
 * @property {number} season
 * @property {string|null} round
 * @property {Object} score
 * @property {string|null} venue
 * @property {string|null} venueCity
 * @property {number} matchScore
 * @property {string} category
 */
module.exports = {};
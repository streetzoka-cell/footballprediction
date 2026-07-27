// backend/config/teamRanking.js

// backend/config/teamRanking.js
const TEAM_POPULARITY = Object.freeze({
  // 100 - Elite Global
  541: 100, // Real Madrid
  529: 100, // Barcelona
  33: 100,  // Man Utd
  40: 100,  // Liverpool
  50: 100,  // Man City
  542: 100, // Atletico Madrid
  157: 100, // Bayern Munich
  169: 100, // PSG
  585: 100, // Inter
  489: 100, // AC Milan
  496: 100, // Juventus
  495: 95,  // Napoli
  548: 95,  // Arsenal
  42: 95,   // Arsenal (ALT ID sometimes used)
  44: 90,   // Chelsea
  47: 90,   // Tottenham
  34: 85,   // Newcastle
  
  // 80 - 90 (Strong Global/Regional)
  511: 85,  // Atalanta
  536: 85,  // Sevilla
  798: 80,  // Sporting CP
  211: 80,  // Dortmund
  96: 80,   // Benfica
  228: 75,  // Feyenoord
  2939: 75, // Al-Hilal
  2933: 75, // Al-Nassr
  2931: 70, // Al-Ahli SFC
});

const DEFAULT_TEAM_SCORE = 30; // Default for teams not in the map

module.exports = { TEAM_POPULARITY, DEFAULT_TEAM_SCORE };
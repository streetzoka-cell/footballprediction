// backend-v1/src/normalisers/index.js
const apiFootball = require('./apiFootballNormaliser');
const sportsDb    = require('./sportsDbNormaliser');
const footballData = require('./footballDataNormaliser');
const isports     = require('./isportsNormaliser'); // ★ NEW

module.exports = {
  apiFootball,
  sportsDb,
  footballData,
  isports,
};
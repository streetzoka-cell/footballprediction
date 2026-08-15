'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * ============================================================
 * ZOKASCORE V2 — ML PREDICTION ENGINE
 * ============================================================
 *
 * Architecture:
 *
 *   Python Pipeline 50
 *          ↓
 *   public_data/predictions/YYYY-MM-DD.json
 *          ↓
 *   MLPredictionEngine
 *          ↓
 *   Node.js API
 *          ↓
 *   Frontend
 *
 * IMPORTANT:
 *   This service does NOT perform ML inference.
 *   Python performs the heavy inference offline.
 *
 *   Node.js only reads pre-computed static prediction JSON.
 * ============================================================
 */

const PREDICTIONS_DIR = path.join(
  process.cwd(),
  'public_data',
  'predictions'
);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

class MLPredictionEngine {

  /**
   * Validate the prediction date format.
   *
   * Expected:
   *   YYYY-MM-DD
   */
  isValidDateFormat(dateStr) {
    return (
      typeof dateStr === 'string' &&
      DATE_REGEX.test(dateStr)
    );
  }

  /**
   * Resolve the prediction file for a date.
   */
  getPredictionFilePath(dateStr) {
    if (!this.isValidDateFormat(dateStr)) {
      return null;
    }

    return path.join(
      PREDICTIONS_DIR,
      `${dateStr}.json`
    );
  }

  /**
   * Gets all pre-computed predictions for a date.
   *
   * @param {string} dateStr YYYY-MM-DD
   * @returns {Array|null}
   */
  getPredictionsForDate(dateStr) {

    const filePath = this.getPredictionFilePath(dateStr);

    if (!filePath) {
      logger.warn(
        `[MLPredictionEngine] Invalid date format: ${dateStr}`
      );

      return null;
    }

    try {

      if (!fs.existsSync(filePath)) {
        logger.debug?.(
          `[MLPredictionEngine] No prediction file for ${dateStr}`
        );

        return null;
      }

      const raw = fs.readFileSync(
        filePath,
        'utf8'
      );

      const data = JSON.parse(raw);

      /**
       * Pipeline 50 contract:
       *
       * {
       *   date: "YYYY-MM-DD",
       *   generated_at: "...",
       *   predictions: []
       * }
       */

      if (!data || typeof data !== 'object') {
        logger.error(
          `[MLPredictionEngine] Invalid prediction payload for ${dateStr}`
        );

        return null;
      }

      if (!Array.isArray(data.predictions)) {
        logger.error(
          `[MLPredictionEngine] Missing predictions array for ${dateStr}`
        );

        return null;
      }

      return data.predictions;

    } catch (error) {

      logger.error(
        `[MLPredictionEngine] Error reading predictions for ${dateStr}: ${error.message}`
      );

      return null;
    }
  }

  /**
   * Gets a prediction for a specific match.
   *
   * @param {string|number} matchId
   * @param {string} dateStr YYYY-MM-DD
   * @returns {Object|null}
   */
  getMatchPrediction(matchId, dateStr) {

    if (
      matchId === undefined ||
      matchId === null ||
      matchId === ''
    ) {
      return null;
    }

    const predictions = this.getPredictionsForDate(dateStr);

    if (!predictions) {
      return null;
    }

    const normalizedMatchId = String(matchId);

    return (
      predictions.find(
        prediction =>
          prediction &&
          prediction.matchId !== undefined &&
          prediction.matchId !== null &&
          String(prediction.matchId) === normalizedMatchId
      ) || null
    );
  }

  /**
   * Check whether predictions exist for a date.
   *
   * Useful for health checks / scheduler diagnostics.
   */
  hasPredictionsForDate(dateStr) {

    const filePath = this.getPredictionFilePath(dateStr);

    if (!filePath) {
      return false;
    }

    return fs.existsSync(filePath);
  }

  /**
   * Return basic metadata about a prediction file.
   *
   * Does not perform ML inference.
   */
  getPredictionMetadata(dateStr) {

    const filePath = this.getPredictionFilePath(dateStr);

    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    try {

      const data = JSON.parse(
        fs.readFileSync(filePath, 'utf8')
      );

      return {
        date: data.date || dateStr,
        generated_at: data.generated_at || null,
        count: Array.isArray(data.predictions)
          ? data.predictions.length
          : 0
      };

    } catch (error) {

      logger.error(
        `[MLPredictionEngine] Metadata read failed for ${dateStr}: ${error.message}`
      );

      return null;
    }
  }
}

module.exports = new MLPredictionEngine();

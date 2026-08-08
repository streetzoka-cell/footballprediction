const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const LAWS_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'laws');

// In-memory cache for Law files
let LAWS_CACHE = null;

function loadLaws() {
  if (LAWS_CACHE) return LAWS_CACHE;
  if (!fs.existsSync(LAWS_DIR)) return [];

  LAWS_CACHE = fs.readdirSync(LAWS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(file => {
      try {
        let fileContent = fs.readFileSync(path.join(LAWS_DIR, file), 'utf8').trim();
        if (fileContent.charCodeAt(0) === 0xFEFF) fileContent = fileContent.slice(1);
        return JSON.parse(fileContent);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return LAWS_CACHE;
}

// GET /api/v1/knowledge/laws
router.get('/laws', (req, res) => {
  try {
    const laws = loadLaws().map(data => ({
      lawNumber: data.lawNumber,
      title: data.title,
      emoji: data.emoji,
      overview: data.overview
    })).sort((a, b) => a.lawNumber - b.lawNumber);
    
    res.json({ success: true, laws });
  } catch (err) {
    console.error('[Knowledge Route Error]', err.message);
    res.status(500).json({ success: false, error: "Failed to load laws." });
  }
});

// GET /api/v1/knowledge/laws/:lawId
router.get('/laws/:lawId', (req, res) => {
  try {
    const { lawId } = req.params;
    const lawData = loadLaws().find(data => String(data.lawNumber) === lawId);

    if (!lawData) return res.status(404).json({ success: false, error: "Law not found." });
    res.json({ success: true, law: lawData });
  } catch (err) {
    console.error('[Knowledge Route Error]', err.message);
    res.status(500).json({ success: false, error: "Failed to load law." });
  }
});

module.exports = router;
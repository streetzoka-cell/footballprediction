const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const LAWS_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'laws');

// GET /api/v1/knowledge/laws
router.get('/laws', (req, res) => {
  try {
    const files = fs.readdirSync(LAWS_DIR).filter(f => f.endsWith('.json'));
    const laws = files.map(file => {
      let data = JSON.parse(fs.readFileSync(path.join(LAWS_DIR, file), 'utf8'));
      return {
        lawNumber: data.lawNumber,
        title: data.title,
        emoji: data.emoji,
        overview: data.overview
      };
    }).sort((a, b) => a.lawNumber - b.lawNumber);
    res.json({ success: true, laws });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to load laws." });
  }
});

// GET /api/v1/knowledge/laws/:lawId
router.get('/laws/:lawId', (req, res) => {
  try {
    const { lawId } = req.params;
    const files = fs.readdirSync(LAWS_DIR).filter(f => f.endsWith('.json'));
    const law = files.map(file => {
      let data = JSON.parse(fs.readFileSync(path.join(LAWS_DIR, file), 'utf8'));
      if (String(data.lawNumber) === lawId) return data;
      return null;
    }).find(Boolean);

    if (!law) return res.status(404).json({ success: false, error: "Law not found." });
    res.json({ success: true, law });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to load law." });
  }
});

module.exports = router;
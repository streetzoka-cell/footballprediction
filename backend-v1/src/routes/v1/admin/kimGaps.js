const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const adminAuth = require('../../../middleware/adminAuth'); // Ensure you have an admin auth middleware

const GAPS_LOG_PATH = path.join(process.cwd(), 'logs', 'kim_knowledge_gaps.json');

// GET /api/v1/admin/kim/gaps
router.get('/gaps', adminAuth, (req, res) => {
  try {
    if (!fs.existsSync(GAPS_LOG_PATH)) {
      return res.json({ success: true, gaps: [] });
    }

    const gaps = JSON.parse(fs.readFileSync(GAPS_LOG_PATH, 'utf8'));
    
    // Group identical questions to show frequency
    const groupedGaps = gaps.reduce((acc, gap) => {
      const key = gap.question.toLowerCase().trim();
      if (!acc[key]) {
        acc[key] = { question: gap.question, count: 1, lastAsked: gap.timestamp, confidence: gap.confidence };
      } else {
        acc[key].count++;
        acc[key].lastAsked = gap.timestamp;
      }
      return acc;
    }, {});

    // Convert to array and sort by most asked
    const sortedGaps = Object.values(groupedGaps).sort((a, b) => b.count - a.count);

    res.json({ success: true, gaps: sortedGaps });
  } catch (err) {
    console.error('[Kim Gaps Error]', err.message);
    res.status(500).json({ success: false, error: "Failed to load knowledge gaps." });
  }
});

module.exports = router;
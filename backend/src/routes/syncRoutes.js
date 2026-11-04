const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { handleSync } = require('../services/syncService');

const router = express.Router();
router.use(authenticateToken);

/**
 * Bidirectional Sync Endpoint
 * Body: {
 *   lastSyncedAt: ISO string | null,
 *   clientTime: ISO string,
 *   changes: {
 *     created: [...],
 *     updated: [...],
 *     deletedIds: [...]
 *   }
 * }
 */
router.post('/', async (req, res) => {
  try {
    const result = await handleSync(req.user.id, req.body);
    res.json(result);
  } catch (error) {
    console.error('Sync route error:', error);
    res.status(500).json({ error: 'SYNC_ERROR', message: error.message });
  }
});

module.exports = router;

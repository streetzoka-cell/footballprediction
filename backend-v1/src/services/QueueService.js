const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');

const QUEUE_FILE = path.join(process.cwd(), 'pending_queue.json');

function readQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch { return []; }
}

function writeQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

async function addToQueue(op) {
  const queue = readQueue();
  queue.push(op);
  writeQueue(queue);
  logger.info(`[QueueService] Added op to queue. Size: ${queue.length}`);
}

async function processQueue() {
  const queue = readQueue();
  if (queue.length === 0) return;

  const db = getDb();
  let processed = 0;
  const remaining = [];

  for (const op of queue) {
    try {
      await db.collection(op.collection).doc(op.docId).set(op.data, op.options || {});
      processed++;
    } catch (err) {
      if (err.code === 8 || err.message.includes('resource-exhausted')) {
        // Quota still exceeded, keep in queue
        remaining.push(op);
      } else {
        logger.error(`[QueueService] Failed op: ${err.message}`);
        // Keep in queue to retry later anyway
        remaining.push(op);
      }
    }
  }

  writeQueue(remaining);
  if (processed > 0) logger.info(`[QueueService] Synced ${processed} ops to Firebase. Remaining: ${remaining.length}`);
}

module.exports = { addToQueue, processQueue };
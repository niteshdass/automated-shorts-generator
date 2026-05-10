'use strict';

require('dotenv').config();
const { Queue } = require('bullmq');
const config = require('../config');

const redisUrl = process.env.REDIS_URL;
console.log('[queues] REDIS_URL present:', !!redisUrl, redisUrl ? `(host: ${redisUrl.split('@')[1] || 'unknown'})` : '(using host/port fallback)');

// Railway injects REDIS_URL — use it if present, else use host/port
const connection = redisUrl
  ? { url: redisUrl }
  : {
      host: config.redis.host,
      port: config.redis.port,
      ...(config.redis.password ? { password: config.redis.password } : {}),
    };

const shortsQueue = new Queue(config.queue.name, {
  connection,
  defaultJobOptions: config.queue.defaultJobOptions,
});

async function addShortsJob(data = {}) {
  const job = await shortsQueue.add('generate-short', data, {
    jobId: `short-${Date.now()}`,
  });
  return job;
}

async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    shortsQueue.getWaitingCount(),
    shortsQueue.getActiveCount(),
    shortsQueue.getCompletedCount(),
    shortsQueue.getFailedCount(),
  ]);
  return { waiting, active, completed, failed };
}

module.exports = { shortsQueue, addShortsJob, getQueueStats, connection };

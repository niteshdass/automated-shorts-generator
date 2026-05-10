'use strict';

require('dotenv').config();
const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { startWorker } = require('./queue/workers');
const { startScheduler } = require('./cron/scheduler');
const { addShortsJob, getQueueStats, shortsQueue } = require('./queue/queues');
const { ensureOutputDirs } = require('./utils/fileManager');
const config = require('./config');
const logger = require('./utils/logger');

async function main() {
  logger.info(`Starting Automated Shorts Generator [${config.env}]`);

  await ensureOutputDirs();

  // ── Worker ────────────────────────────────────────────────────────────────
  await startWorker();

  // ── Cron Scheduler ────────────────────────────────────────────────────────
  startScheduler();

  // ── HTTP API ──────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // ── Bull Board (queue dashboard UI) ───────────────────────────────────────
  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(shortsQueue)],
    serverAdapter: boardAdapter,
  });
  app.use('/admin/queues', boardAdapter.getRouter());

  // Dashboard
  app.get('/', (req, res) => {
    const schedule = config.shorts.cronSchedule;
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shorts Generator Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;min-height:100vh;padding:2rem}
  h1{font-size:1.5rem;font-weight:700;margin-bottom:1.5rem;color:#fff}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;margin-bottom:1.5rem}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:1.25rem}
  .card h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:.75rem}
  .stat{font-size:2rem;font-weight:700;color:#fff}
  .stat.green{color:#22c55e}
  .stat.yellow{color:#eab308}
  .stat.red{color:#ef4444}
  .schedule-list{list-style:none}
  .schedule-list li{padding:.5rem 0;border-bottom:1px solid #2a2a2a;display:flex;justify-content:space-between;align-items:center;font-size:.9rem}
  .schedule-list li:last-child{border-bottom:none}
  .badge{font-size:.7rem;padding:.2rem .5rem;border-radius:999px;background:#22c55e22;color:#22c55e;font-weight:600}
  .badge.next{background:#3b82f622;color:#60a5fa}
  .label{color:#888;font-size:.8rem;margin-top:.25rem}
  .refresh{font-size:.75rem;color:#555;margin-top:1.5rem;text-align:right}
  .channel{color:#60a5fa;font-size:1rem;font-weight:600;margin-bottom:1.5rem}
</style>
</head>
<body>
<h1>🎬 Shorts Generator</h1>
<div class="channel" id="channel">${config.shorts.channelName}</div>
<div class="grid">
  <div class="card">
    <h2>Queue</h2>
    <div class="stat" id="waiting">—</div>
    <div class="label">waiting</div>
    <div style="margin-top:.75rem;display:flex;gap:1rem">
      <div><div id="active" style="font-size:1.25rem;font-weight:700;color:#eab308">—</div><div class="label">active</div></div>
      <div><div id="completed" style="font-size:1.25rem;font-weight:700;color:#22c55e">—</div><div class="label">completed</div></div>
      <div><div id="failed" style="font-size:1.25rem;font-weight:700;color:#ef4444">—</div><div class="label">failed</div></div>
    </div>
  </div>
  <div class="card">
    <h2>Daily Uploads</h2>
    <div class="stat">${config.shorts.maxDailyUploads}</div>
    <div class="label">max per day</div>
    <div style="margin-top:.75rem;font-size:.85rem;color:${config.youtube.uploadEnabled ? '#22c55e' : '#ef4444'}">
      Upload ${config.youtube.uploadEnabled ? '✓ enabled' : '✗ disabled'}
    </div>
  </div>
  <div class="card">
    <h2>Next Scheduled Videos (your local time)</h2>
    <ul class="schedule-list" id="schedule-list"><li>Calculating...</li></ul>
    <div class="label" style="margin-top:.5rem">Schedule: <code style="color:#a78bfa">${schedule}</code> UTC</div>
  </div>
</div>
<div class="grid">
  <div class="card">
    <h2>Links</h2>
    <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:.25rem">
      <a href="/admin/queues" style="color:#60a5fa;text-decoration:none;font-size:.9rem">📊 Bull Board Queue Dashboard →</a>
      <a href="/health" style="color:#60a5fa;text-decoration:none;font-size:.9rem">❤️ Health Check →</a>
      <a href="/stats" style="color:#60a5fa;text-decoration:none;font-size:.9rem">📈 Raw Stats JSON →</a>
    </div>
  </div>
</div>
<div class="refresh">Auto-refreshes every 30s · Last updated: <span id="updated">—</span></div>
<script>
  function parseCronHours(expr) {
    // Parse "0 8,14,20 * * *" → [8, 14, 20]
    const parts = expr.trim().split(/\\s+/);
    if (parts.length < 2) return [];
    const hourPart = parts[1];
    return hourPart.split(',').map(Number).filter(n => !isNaN(n)).sort((a,b) => a-b);
  }

  function getNextScheduled(cronExpr, count) {
    const hours = parseCronHours(cronExpr);
    if (!hours.length) return [];
    const results = [];
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let dayOffset = 0;
    while (results.length < count) {
      for (const h of hours) {
        const t = new Date(todayUTC.getTime() + dayOffset * 86400000 + h * 3600000);
        if (t > now) results.push(t);
        if (results.length >= count) break;
      }
      dayOffset++;
      if (dayOffset > 7) break;
    }
    return results;
  }

  function fmt(d) {
    return d.toLocaleString(undefined, {weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
  }

  function renderSchedule() {
    const cronExpr = '${schedule.replace(/"/g, '')}';
    const times = getNextScheduled(cronExpr, 5);
    const list = document.getElementById('schedule-list');
    if (!times.length) { list.innerHTML = '<li>Could not parse schedule</li>'; return; }
    list.innerHTML = times.map((t,i) => \`<li><span>\${fmt(t)}</span><span class="badge \${i===0?'next':''}">\${i===0?'next':''}</span></li>\`).join('');
  }

  async function fetchStats() {
    try {
      const r = await fetch('/stats');
      const s = await r.json();
      document.getElementById('waiting').textContent = s.waiting ?? '—';
      document.getElementById('active').textContent = s.active ?? '—';
      document.getElementById('completed').textContent = s.completed ?? '—';
      document.getElementById('failed').textContent = s.failed ?? '—';
    } catch(e) { document.getElementById('waiting').textContent = 'err'; }
    document.getElementById('updated').textContent = new Date().toLocaleTimeString();
  }

  renderSchedule();
  fetchStats();
  setInterval(() => { renderSchedule(); fetchStats(); }, 30000);
</script>
</body>
</html>`);
  });

  // Health check
  app.get('/health', async (req, res) => {
    const stats = await getQueueStats();
    res.json({
      status: 'ok',
      env: config.env,
      queue: stats,
      uploadEnabled: config.youtube.uploadEnabled,
      timestamp: new Date().toISOString(),
    });
  });

  // Manually trigger a shorts generation
  app.post('/generate', async (req, res) => {
    try {
      const job = await addShortsJob({
        triggeredBy: 'api',
        ...req.body,
      });
      logger.info(`API triggered job: ${job.id}`);
      res.status(202).json({ jobId: job.id, status: 'queued' });
    } catch (err) {
      logger.error(`API trigger failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Queue stats
  app.get('/stats', async (req, res) => {
    const stats = await getQueueStats();
    res.json(stats);
  });

  app.listen(config.port, () => {
    logger.info(`HTTP API listening on port ${config.port}`);
    logger.info(`GET  /admin/queues — Bull Board dashboard (UI)`);
    logger.info(`POST /generate     — trigger shorts generation`);
    logger.info(`GET  /health       — health check`);
    logger.info(`GET  /stats        — queue statistics`);
  });

  // Global error handlers
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error(`Startup failed: ${err.message}`);
  process.exit(1);
});

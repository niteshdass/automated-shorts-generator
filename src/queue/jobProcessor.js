'use strict';

const { v4: uuidv4 } = require('uuid');
const { fetchNews } = require('../modules/news/newsRouter');
const { generateScript, estimateDurationSeconds } = require('../modules/script/scriptGenerator');
const { generateAudio } = require('../modules/tts/edgeTts');
const { generateSubtitles } = require('../modules/subtitles/subtitleGenerator');
const { renderVideo } = require('../modules/video/remotionRenderer');
const { combineMedia } = require('../modules/video/ffmpegCombiner');
const { uploadToYoutube } = require('../modules/upload/youtubeUploader');
const { createJobDir, jobPath, cleanJobDir, writeJson } = require('../utils/fileManager');
const { pickBackgroundVideo } = require('../utils/backgroundPicker');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Full pipeline: news → script → TTS → subtitles → video → upload
 */
async function processShortJob(job) {
  const jobId = job.id || uuidv4();
  const category = job.data?.category || 'sports';
  const log = (msg, meta = {}) => logger.info(msg, { jobId, category, ...meta });
  const startTime = Date.now();

  log('Pipeline started');

  // ── 1. Create output directory ────────────────────────────────────────────
  const outputDir = await createJobDir(jobId);
  await job.updateProgress(5);

  // ── 2. Fetch news ─────────────────────────────────────────────────────────
  log(`Step 1/7: Fetching trending ${category} news`);
  const article = await fetchNews(category, jobId);
  log(`Selected article: "${article.title}"`);
  await writeJson(jobPath(jobId, 'article.json'), article);
  await job.updateProgress(15);

  // ── 3. Generate AI script ─────────────────────────────────────────────────
  log('Step 2/7: Generating AI script');
  const script = await generateScript(article, jobId, category);
  await writeJson(jobPath(jobId, 'script.json'), script);
  await job.updateProgress(25);

  // ── 4. Generate TTS audio ─────────────────────────────────────────────────
  log('Step 3/7: Generating voice audio');
  const { audioPath, durationSeconds, wordTimings } = await generateAudio(
    script.fullScript,
    outputDir,
    jobId
  );
  await job.updateProgress(40);

  // ── 5. Generate subtitles ─────────────────────────────────────────────────
  log('Step 4/7: Generating subtitles');
  const { srtPath, chunks: subtitleChunks } = await generateSubtitles(
    wordTimings,
    outputDir,
    jobId
  );
  await job.updateProgress(50);

  // ── 6. Render base video with Remotion ────────────────────────────────────
  log('Step 5/7: Rendering video with Remotion');
  const backgroundVideoSrc = pickBackgroundVideo(category);
  if (backgroundVideoSrc) {
    log(`Using background video: ${backgroundVideoSrc}`);
  }

  const remotionProps = {
    headline: article.title,
    subtitles: subtitleChunks,
    channelName: config.shorts.channelName,
    backgroundVideoSrc: backgroundVideoSrc || null,
    backgroundImageUrl: backgroundVideoSrc ? null : (article.imageUrl || null),
    audioSrc: null, // Audio added via FFmpeg (Remotion handles muted base)
  };
  const baseVideoPath = await renderVideo(remotionProps, outputDir, durationSeconds, jobId);
  await job.updateProgress(75);

  // ── 7. Combine video + audio + subtitles ──────────────────────────────────
  log('Step 6/7: Combining media with FFmpeg');
  const finalVideoPath = await combineMedia({
    videoPath: baseVideoPath,
    audioPath,
    subtitlesPath: srtPath,
    outputDir,
    jobId,
  });
  await job.updateProgress(90);

  // ── 8. Upload to YouTube ──────────────────────────────────────────────────
  log('Step 7/7: Uploading to YouTube');
  const uploadResult = await uploadToYoutube({
    videoPath: finalVideoPath,
    title: script.title,
    description: script.description,
    hashtags: script.hashtags,
    thumbnailText: script.thumbnailText,
    jobId,
    category,
  });
  await job.updateProgress(100);

  // ── Save metadata ─────────────────────────────────────────────────────────
  const metadata = {
    jobId,
    article,
    script,
    durationSeconds,
    finalVideoPath,
    uploadResult,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };
  await writeJson(jobPath(jobId, 'metadata.json'), metadata);

  // ── Cleanup if upload succeeded ───────────────────────────────────────────
  if (uploadResult?.videoId && config.output.cleanupAfterUpload) {
    await cleanJobDir(jobId);
    log('Job directory cleaned up');
  }

  log(`Pipeline complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`, {
    youtubeUrl: uploadResult?.url,
  });

  return {
    jobId,
    title: script.title,
    youtubeUrl: uploadResult?.url,
    videoId: uploadResult?.videoId,
    durationSeconds,
  };
}

module.exports = { processShortJob };

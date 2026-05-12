'use strict';

const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const logger = require('../../utils/logger');
const { withRetry } = require('../../utils/retry');

/**
 * Generate audio. Tries Edge TTS first, falls back to system TTS (macOS say / espeak).
 * Returns: { audioPath, durationSeconds, wordTimings }
 */
async function generateAudio(text, outputDir, jobId) {
  try {
    return await generateEdgeTTS(text, outputDir, jobId);
  } catch (err) {
    logger.error(`Edge TTS failed (${err.message || err}) — falling back to system TTS (quality will be poor)`, { jobId });
    return generateSystemTTS(text, outputDir, jobId);
  }
}

// ── Edge TTS (Microsoft) ──────────────────────────────────────────────────────
async function generateEdgeTTS(text, outputDir, jobId) {
  return withRetry(async () => {
    const audioPath = path.join(outputDir, 'audio.webm');
    logger.info(`Generating TTS via Edge: voice=${config.tts.voice}`, { jobId });

    const tts = new MsEdgeTTS();

    await tts.setMetadata(
      config.tts.voice,
      OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS
    );

    const ssml = buildSSML(text);
    const wordTimings = [];

    tts.on('WordBoundary', (event) => {
      wordTimings.push({
        word: event.Text,
        startMs: event.AudioOffset / 10000,
        endMs: (event.AudioOffset + event.Duration) / 10000,
      });
    });

    const readable = await tts.toStream(ssml);

    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(audioPath);
      readable.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      readable.on('error', (e) => reject(new Error(String(e))));
    });

    const stat = await fs.stat(audioPath);
    if (stat.size < 500) throw new Error('Audio file too small — TTS likely failed silently');

    const durationSeconds = wordTimings.length > 0
      ? Math.ceil(wordTimings[wordTimings.length - 1].endMs / 1000) + 0.5
      : estimateDuration(text);

    logger.info(`Edge TTS done: ${durationSeconds.toFixed(1)}s, ${wordTimings.length} word boundaries`, { jobId });

    return {
      audioPath,
      durationSeconds,
      wordTimings: wordTimings.length > 0 ? wordTimings : estimateTimings(text, durationSeconds),
    };
  }, { attempts: 2, label: 'Edge TTS', jobId });
}

// ── System TTS fallback (macOS say / Linux espeak) ────────────────────────────
async function generateSystemTTS(text, outputDir, jobId) {
  logger.info('Using system TTS fallback', { jobId });

  const platform = process.platform;
  const aiffPath = path.join(outputDir, 'audio.aiff');
  const audioPath = path.join(outputDir, 'audio.mp3');

  // Resolve ffmpeg binary — bundled or system
  let ffmpegBin = 'ffmpeg';
  try {
    ffmpegBin = require('@ffmpeg-installer/ffmpeg').path;
  } catch (_) {}

  if (platform === 'darwin') {
    // macOS built-in `say` — output to AIFF (no --data-format flag needed)
    await new Promise((resolve, reject) => {
      const proc = spawn('say', ['-v', 'Daniel', '-r', '175', '-o', aiffPath, text]);
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`say exited ${code}`)));
      proc.on('error', reject);
    });

    // Convert AIFF → MP3 via bundled FFmpeg
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, ['-y', '-i', aiffPath, '-codec:a', 'libmp3lame', '-q:a', '4', audioPath]);
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
      proc.on('error', reject);
    });

    await fs.remove(aiffPath);

  } else if (platform === 'linux') {
    const wavPath = path.join(outputDir, 'audio.wav');
    await new Promise((resolve, reject) => {
      const proc = spawn('espeak-ng', ['-s', '160', '-w', wavPath, text]);
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`espeak exited ${code}`)));
      proc.on('error', reject);
    });
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, ['-y', '-i', wavPath, audioPath]);
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
      proc.on('error', reject);
    });
    await fs.remove(wavPath);
  } else {
    throw new Error(`No TTS fallback for platform: ${platform}`);
  }

  const durationSeconds = estimateDuration(text);
  const wordTimings = estimateTimings(text, durationSeconds);

  logger.info(`System TTS done: ~${durationSeconds.toFixed(1)}s (estimated)`, { jobId });

  return { audioPath, durationSeconds, wordTimings };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildSSML(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
    <voice name="${config.tts.voice}">
      <prosody rate="${config.tts.rate}" volume="${config.tts.volume}" pitch="${config.tts.pitch}">
        ${escaped}
      </prosody>
    </voice>
  </speak>`;
}

function estimateTimings(text, durationSeconds) {
  const words = text.split(/\s+/).filter(Boolean);
  const totalMs = durationSeconds * 1000;
  const msPerWord = totalMs / words.length;
  return words.map((word, i) => ({
    word,
    startMs: Math.round(i * msPerWord),
    endMs: Math.round((i + 1) * msPerWord),
  }));
}

function estimateDuration(text) {
  return (text.split(/\s+/).filter(Boolean).length / 130) * 60;
}

module.exports = { generateAudio };

'use strict';

const path = require('path');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const config = require('../../config');
const logger = require('../../utils/logger');
const { withRetry } = require('../../utils/retry');

const ENTRY_POINT = path.resolve(__dirname, '../../remotion/index.jsx');

let bundleCache = null;

async function getBundleUrl() {
  if (bundleCache) return bundleCache;

  logger.info('Bundling Remotion composition (first run)...');
  bundleCache = await bundle({
    entryPoint: ENTRY_POINT,
    webpackOverride: (currentConfig) => currentConfig,
  });
  logger.info('Remotion bundle ready');
  return bundleCache;
}

/**
 * Render a CricketShort video using Remotion headless renderer.
 *
 * @param {object} props - Composition props passed to CricketShort
 * @param {string} outputDir - Directory for output
 * @param {number} durationSeconds - Video duration
 * @param {string} jobId
 * @returns {Promise<string>} Path to rendered video
 */
async function renderVideo(props, outputDir, durationSeconds, jobId) {
  return withRetry(async () => {
    logger.info('Starting Remotion render', { jobId });

    const bundleUrl = await getBundleUrl();
    const fps = config.video.fps;
    const durationInFrames = Math.round(durationSeconds * fps);

    const composition = await selectComposition({
      serveUrl: bundleUrl,
      id: 'CricketShort',
      inputProps: props,
    });

    const outputPath = path.join(outputDir, 'base-video.mp4');

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames,
        width: config.video.width,
        height: config.video.height,
        fps,
      },
      serveUrl: bundleUrl,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: props,
      concurrency: 1,
      x264Preset: 'ultrafast',
      ffmpegOverride: ({ args }) => {
        // Limit FFmpeg threads to prevent OOM in constrained containers
        const idx = args.indexOf('-threads');
        if (idx !== -1) args.splice(idx, 2);
        return ['-threads', '2', ...args];
      },
      chromiumOptions: {
        disableWebSecurity: true,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        if (pct % 20 === 0) {
          logger.info(`Render progress: ${pct}%`, { jobId });
        }
      },
    });

    logger.info(`Video rendered: ${outputPath}`, { jobId });
    return outputPath;
  }, { attempts: 2, label: 'Remotion render', jobId });
}

module.exports = { renderVideo };

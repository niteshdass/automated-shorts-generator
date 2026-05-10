'use strict';

const fs = require('fs');
const path = require('path');

// Remotion serves files from public/ at the project root
const PUBLIC_DIR = path.resolve(__dirname, '../../public/backgrounds');
const SUPPORTED = new Set(['.mp4', '.webm', '.mov']);

/**
 * Returns a random static-file path (relative to public/) for the given
 * category, or null if the pool is empty.
 *
 * Example return value: 'backgrounds/sports/stadium.mp4'
 */
function pickBackgroundVideo(category) {
  const subdir = category === 'ai' ? 'ai' : 'sports';
  const dir = path.join(PUBLIC_DIR, subdir);

  let files;
  try {
    files = fs.readdirSync(dir).filter(
      (f) => !f.startsWith('.') && SUPPORTED.has(path.extname(f).toLowerCase())
    );
  } catch {
    return null;
  }

  if (!files.length) return null;

  const picked = files[Math.floor(Math.random() * files.length)];
  return `backgrounds/${subdir}/${picked}`;
}

module.exports = { pickBackgroundVideo };

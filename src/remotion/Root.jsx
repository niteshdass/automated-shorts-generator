const React = require('react');
const { Composition } = require('remotion');
const { CricketShort } = require('./compositions/CricketShort');

const DEFAULT_SUBTITLES = [
  { index: 1, text: 'Loading subtitles...', startFrame: 0, endFrame: 90, startMs: 0, endMs: 3000 },
];

function RemotionRoot() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(Composition, {
      id: 'CricketShort',
      component: CricketShort,
      durationInFrames: 30 * 55, // 55 seconds at 30fps default
      fps: 30,
      width: 1080,
      height: 1920,
      defaultProps: {
        headline: 'Cricket News Headline',
        subtitles: DEFAULT_SUBTITLES,
        channelName: 'CricketViralShorts',
        backgroundImageUrl: null,
        backgroundVideoSrc: null,
        audioSrc: null,
      },
    })
  );
}

module.exports = { RemotionRoot };

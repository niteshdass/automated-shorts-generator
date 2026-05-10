const React = require('react');
const {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  AbsoluteFill,
  Audio,
  Video,
  staticFile,
} = require('remotion');

// ── Subtitle entry component ──────────────────────────────────────────────────
function SubtitleEntry({ chunk, fps }) {
  const frame = useCurrentFrame();
  const relFrame = frame - chunk.startFrame;
  const totalFrames = chunk.endFrame - chunk.startFrame;

  const opacity = interpolate(relFrame, [0, 5, totalFrames - 5, totalFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = spring({ frame: relFrame, fps, config: { damping: 18, stiffness: 200 } });

  return React.createElement(
    'div',
    {
      style: {
        opacity,
        transform: `scale(${interpolate(scale, [0, 1], [0.9, 1])})`,
        textAlign: 'center',
        padding: '0 48px',
      },
    },
    React.createElement(
      'span',
      {
        style: {
          fontSize: 72,
          fontWeight: 900,
          color: '#FFFFFF',
          textShadow: '0 4px 20px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.5)',
          lineHeight: 1.15,
          letterSpacing: '-0.5px',
          WebkitTextStroke: '2px rgba(0,0,0,0.3)',
          display: 'inline-block',
        },
      },
      chunk.text
    )
  );
}

// ── Active subtitle controller ────────────────────────────────────────────────
function Subtitles({ subtitles, fps }) {
  const frame = useCurrentFrame();
  const active = subtitles.filter(
    (c) => frame >= c.startFrame && frame <= c.endFrame
  );

  return React.createElement(
    'div',
    {
      style: {
        position: 'absolute',
        bottom: 260,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 180,
      },
    },
    active.map((chunk) =>
      React.createElement(SubtitleEntry, { key: chunk.index, chunk, fps })
    )
  );
}

// ── Animated headline at top ──────────────────────────────────────────────────
function Headline({ text, fps }) {
  const frame = useCurrentFrame();
  const progress = spring({ frame, fps, config: { damping: 20, stiffness: 120 } });

  const translateY = interpolate(progress, [0, 1], [-100, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  const words = text.split(' ').slice(0, 8).join(' '); // cap to prevent overflow

  return React.createElement(
    'div',
    {
      style: {
        position: 'absolute',
        top: 80,
        left: 0,
        right: 0,
        padding: '0 40px',
        transform: `translateY(${translateY}px)`,
        opacity,
        textAlign: 'center',
      },
    },
    React.createElement(
      'div',
      {
        style: {
          background: 'linear-gradient(135deg, rgba(0,0,0,0.85) 0%, rgba(20,20,20,0.9) 100%)',
          borderRadius: 20,
          padding: '20px 32px',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            fontSize: 44,
            fontWeight: 800,
            color: '#FFD700',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            lineHeight: 1.2,
            textTransform: 'uppercase',
            letterSpacing: '1px',
          },
        },
        '🏏 CRICKET'
      ),
      React.createElement(
        'div',
        {
          style: {
            fontSize: 38,
            fontWeight: 700,
            color: '#FFFFFF',
            marginTop: 8,
            lineHeight: 1.3,
          },
        },
        words
      )
    )
  );
}

// ── Background: B-roll video > article image > animated gradient ──────────────
function Background({ backgroundVideoSrc, backgroundImageUrl }) {
  const frame = useCurrentFrame();
  const hue = interpolate(frame, [0, 300], [220, 260], { extrapolateRight: 'clamp' });
  const scale = interpolate(frame, [0, 300], [1, 1.05], { extrapolateRight: 'clamp' });

  const CLIP_STYLE = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: 'brightness(0.4) saturate(1.2)',
  };

  let bg;
  if (backgroundVideoSrc) {
    bg = React.createElement(Video, {
      src: staticFile(backgroundVideoSrc),
      style: CLIP_STYLE,
      muted: true,
      loop: true,
    });
  } else if (backgroundImageUrl) {
    bg = React.createElement('img', {
      src: backgroundImageUrl,
      style: { ...CLIP_STYLE, transform: `scale(${scale})` },
    });
  } else {
    bg = React.createElement('div', {
      style: {
        width: '100%',
        height: '100%',
        background: `linear-gradient(
          160deg,
          hsl(${hue}, 60%, 10%) 0%,
          hsl(${hue + 20}, 50%, 5%) 50%,
          hsl(140, 50%, 8%) 100%
        )`,
      },
    });
  }

  return React.createElement(
    AbsoluteFill,
    {},
    bg,
    // Dark overlay for readability
    React.createElement('div', {
      style: {
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.5) 100%)',
      },
    })
  );
}

// ── Progress bar at bottom ────────────────────────────────────────────────────
function ProgressBar({ durationInFrames }) {
  const frame = useCurrentFrame();
  const progress = frame / durationInFrames;

  return React.createElement(
    'div',
    {
      style: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 8,
        background: 'rgba(255,255,255,0.15)',
      },
    },
    React.createElement('div', {
      style: {
        height: '100%',
        width: `${progress * 100}%`,
        background: 'linear-gradient(90deg, #FFD700, #FF6B35)',
        transition: 'width 0.1s linear',
      },
    })
  );
}

// ── Channel branding ──────────────────────────────────────────────────────────
function Branding({ channelName }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return React.createElement(
    'div',
    {
      style: {
        position: 'absolute',
        bottom: 30,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity,
      },
    },
    React.createElement(
      'div',
      {
        style: {
          background: 'rgba(255, 215, 0, 0.15)',
          border: '1px solid rgba(255,215,0,0.4)',
          borderRadius: 50,
          padding: '10px 28px',
          backdropFilter: 'blur(8px)',
        },
      },
      React.createElement(
        'span',
        {
          style: {
            color: '#FFD700',
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: '1px',
          },
        },
        `@${channelName}`
      )
    )
  );
}

// ── Subscribe CTA (appears at end) ────────────────────────────────────────────
function SubscribeCTA({ durationInFrames, fps }) {
  const frame = useCurrentFrame();
  const ctaStartFrame = durationInFrames - fps * 10; // last 10 seconds

  if (frame < ctaStartFrame) return null;

  const relFrame = frame - ctaStartFrame;
  const scale = spring({ frame: relFrame, fps, config: { damping: 15, stiffness: 150 } });

  return React.createElement(
    'div',
    {
      style: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        textAlign: 'center',
        pointerEvents: 'none',
        marginTop: 300,
      },
    },
    React.createElement(
      'div',
      {
        style: {
          background: 'linear-gradient(135deg, #FF0000, #CC0000)',
          borderRadius: 60,
          padding: '22px 60px',
          boxShadow: '0 8px 32px rgba(255,0,0,0.4)',
        },
      },
      React.createElement(
        'span',
        {
          style: {
            color: '#FFFFFF',
            fontSize: 52,
            fontWeight: 900,
            letterSpacing: '1px',
          },
        },
        '🔔 SUBSCRIBE'
      )
    )
  );
}

// ── Root composition ──────────────────────────────────────────────────────────
function CricketShort({ headline, subtitles, channelName, backgroundImageUrl, backgroundVideoSrc, audioSrc }) {
  const { fps, durationInFrames } = useVideoConfig();

  return React.createElement(
    AbsoluteFill,
    {
      style: {
        fontFamily: "'Inter', 'Arial Black', 'Impact', sans-serif",
        overflow: 'hidden',
        backgroundColor: '#0a0f1a',
      },
    },
    React.createElement(Background, { backgroundVideoSrc, backgroundImageUrl }),
    React.createElement(Headline, { text: headline, fps }),
    React.createElement(Subtitles, { subtitles: subtitles || [], fps }),
    React.createElement(SubscribeCTA, { durationInFrames, fps }),
    React.createElement(Branding, { channelName }),
    React.createElement(ProgressBar, { durationInFrames }),
    audioSrc && React.createElement(Audio, { src: audioSrc })
  );
}

module.exports = { CricketShort };

import { useEffect, useState, useRef, type CSSProperties } from "react";

interface VisualizerProps {
  isSpeaking: boolean;
  audioStream?: MediaStream | null;
}

// Speech is detected relative to a tracked ambient noise floor rather than a
// fixed constant — different mics/interfaces (USB audio devices, built-in
// laptop mics, etc.) sit at very different baseline noise levels, so a fixed
// threshold that works on one setup can either false-trigger constantly or
// never trigger at all on another. The floor is only updated while presumed
// silent so it doesn't drift upward while the user is actually speaking.
// ACTIVATE/DEACTIVATE margins above that floor give the same anti-flicker
// hysteresis as before (must exceed the higher margin to start being treated
// as speech, then drop below the lower margin to be treated as silence again).
const NOISE_FLOOR_ADAPT_RATE = 0.01;
const ACTIVATE_MARGIN = 0.06;
const DEACTIVATE_MARGIN = 0.03;
// Absolute floor below which we never treat sound as silence-worthy-of-margin
// (guards against a near-silent room making the mic implausibly sensitive).
const MIN_ACTIVATE_LEVEL = 0.05;
// Real speech always has micro-pauses (breaths, gaps between words) that dip
// below the deactivate threshold. If the mic reads continuously "active" for
// longer than any plausible unbroken sentence, the sustained level is almost
// certainly a real but persistent noise source (fan hum, mic self-noise that
// rose after the initial calibration window, etc.) rather than speech — snap
// the noise floor to the current level immediately instead of waiting for a
// silence window that will never come with the slow EMA adaptation.
const MAX_CONTINUOUS_ACTIVE_MS = 4000;
// Mic-driven activity must hold above the noise floor for this long before
// switching to the talk video, so brief noise spikes/pops don't false-trigger it.
const ACTIVATE_HOLD_MS = 200;
// Holds the "talking" video for a short window after activity drops so brief
// pauses between words (breaths, etc.) don't restart the video from frame 0.
const DEACTIVATE_HOLD_MS = 500;

export const Visualizer = ({ isSpeaking, audioStream }: VisualizerProps) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedRef = useRef(0);
  const micActiveRef = useRef(false);
  const noiseFloorRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioStream) {
      setAudioLevel(0);
      smoothedRef.current = 0;
      micActiveRef.current = false;
      noiseFloorRef.current = 0;
      activeSinceRef.current = null;
      return;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyzer = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(audioStream);

    source.connect(analyzer);
    analyzer.fftSize = 256;
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyzerRef.current = analyzer;
    dataArrayRef.current = dataArray;

    const updateLevel = () => {
      if (!analyzerRef.current || !dataArrayRef.current) return;

      // @ts-ignore
      analyzerRef.current.getByteFrequencyData(dataArrayRef.current);

      const sum = dataArrayRef.current.reduce((a, b) => a + b, 0);
      const raw = sum / dataArrayRef.current.length / 128;

      // Exponential moving average to smooth out jitter
      smoothedRef.current = smoothedRef.current * 0.75 + raw * 0.25;

      const now = performance.now();

      // Only track the ambient floor while presumed silent, so genuine speech
      // doesn't drag the baseline upward and make the mic progressively less
      // sensitive the longer someone talks.
      if (!micActiveRef.current) {
        noiseFloorRef.current =
          noiseFloorRef.current * (1 - NOISE_FLOOR_ADAPT_RATE) +
          smoothedRef.current * NOISE_FLOOR_ADAPT_RATE;
      } else if (
        activeSinceRef.current !== null &&
        now - activeSinceRef.current > MAX_CONTINUOUS_ACTIVE_MS
      ) {
        // Stuck "active" for longer than any real unbroken sentence — the
        // sustained level is a persistent noise source, not speech. Snap the
        // floor to the current level immediately rather than waiting for a
        // silence window under the slow EMA that will never arrive.
        noiseFloorRef.current = smoothedRef.current;
        micActiveRef.current = false;
        activeSinceRef.current = null;
      }

      const activateThreshold = Math.max(
        noiseFloorRef.current + ACTIVATE_MARGIN,
        MIN_ACTIVATE_LEVEL
      );
      const deactivateThreshold = noiseFloorRef.current + DEACTIVATE_MARGIN;

      // Hysteresis: only flip the active/silent flag at the opposite edge of
      // whichever threshold is currently relevant, not the same one every frame.
      if (micActiveRef.current) {
        if (smoothedRef.current < deactivateThreshold) {
          micActiveRef.current = false;
          activeSinceRef.current = null;
        }
      } else if (smoothedRef.current > activateThreshold) {
        micActiveRef.current = true;
        activeSinceRef.current = now;
      }
      setAudioLevel(micActiveRef.current ? smoothedRef.current : 0);

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      audioContext.close();
    };
  }, [audioStream]);

  // Continuously proportional — no binary toggle.
  // When speaking, amplify the visual response further.
  const level = isSpeaking ? Math.max(audioLevel, 0.15) : audioLevel;
  const hasActivity = isSpeaking || level > 0;

  // Agent speech (isSpeaking) is a clean discrete signal from the SDK, so it
  // switches to "talk" instantly. Mic-driven activity is noisy (hiss, pops),
  // so it must hold above the floor for ACTIVATE_HOLD_MS before switching.
  // Either way, dropping back to "idle" is held for DEACTIVATE_HOLD_MS so
  // brief pauses between words don't flicker/restart the video.
  useEffect(() => {
    const delay = hasActivity ? (isSpeaking ? 0 : ACTIVATE_HOLD_MS) : DEACTIVATE_HOLD_MS;
    const timeout = window.setTimeout(() => setIsActive(hasActivity), delay);
    return () => clearTimeout(timeout);
  }, [hasActivity, isSpeaking]);

  const base = import.meta.env.BASE_URL;

  // Both videos stay mounted, playing and looping continuously. Idle always
  // stays visible as the base layer; talk fades in/out on top of it (DOM
  // order puts it above idle) instead of the two crossfading exclusively.
  //
  // Sizing is set via inline style (not w-full/h-full/object-contain utility
  // classes) because a playing <video> element's GPU-composited layer can get
  // stuck at its old rendered size after a CSS-only (class) size change —
  // inline styles avoid that class-swap path and force a direct relayout.
  const playMuted = (el: HTMLVideoElement | null) => {
    if (!el) return;
    el.muted = true;
    el.play().catch(() => {});
  };

  const videoStyle = (visible: boolean, scale = 1): CSSProperties => ({
    width: "100%",
    height: "100%",
    objectFit: "contain",
    opacity: visible ? 1 : 0,
    transform: scale !== 1 ? `scale(${scale})` : undefined,
  });

  return (
    <div className="relative pointer-events-none" style={{ width: "160vmin", height: "160vmin" }}>
      <video
        ref={playMuted}
        src={`${base}idle.webm`}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 select-none pointer-events-none"
        style={videoStyle(true)}
      />
      <video
        ref={playMuted}
        src={`${base}talk.webm`}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 select-none pointer-events-none transition-opacity duration-300"
        style={videoStyle(isActive, 0.5)}
      />
    </div>
  );
};

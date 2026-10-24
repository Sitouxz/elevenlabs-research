// All gesture tuning lives here. Ratios are measured on MediaPipe *world*
// landmarks (metric, camera-distance independent) and normalised by palm size,
// so they hold at any distance from the camera.

/** Pinch (thumb tip <-> index tip) distance / palm size. */
export const PINCH_ON = 0.35;
/** Wider than PINCH_ON: hysteresis stops the pinch flickering at the threshold. */
export const PINCH_OFF = 0.6;
/** Above this a release is unambiguous and fires immediately (no debounce frame). */
export const PINCH_OFF_HARD = 0.85;

/** Finger extension = |tip - wrist| / |mcp - wrist|. */
export const FINGER_EXTENDED = 1.6;
export const FINGER_CURLED = 1.35;

/** Hold a fist this long to leave gesture mode. */
export const FIST_EXIT_MS = 1500;

/**
 * Cursor sits where the pinch started this long ago, so the fingers closing
 * onto each other doesn't push the cursor off the target.
 */
export const PINCH_ANCHOR_LOOKBACK_MS = 100;

/** Movement (px) under which a pinch counts as a click rather than a drag. */
export const CLICK_SLOP_PX = 14;

/** Frames a scroll/fist pose must hold before it activates (kills flicker). */
export const POSE_STABLE_FRAMES = 2;

/** Hand vanishes for less than this and any pinch/drag survives. */
export const LOST_GRACE_MS = 140;

/** One Euro filter (px / seconds units). Higher beta = less lag when moving fast. */
export const FILTER_MIN_CUTOFF = 1.4;
export const FILTER_BETA = 0.035;
export const FILTER_D_CUTOFF = 1.0;

/** Look-ahead to cancel part of the pipeline latency. Seconds; clamped in px. */
export const LEAD_SECONDS = 0.014;
export const LEAD_MAX_PX = 28;

/** Scroll px per px of hand movement while holding the two-finger pose. */
export const SCROLL_GAIN = 1.6;

/**
 * The camera image is zoomed a little so the screen edges map to a region
 * inside the frame, where tracking is most reliable.
 */
export const VIDEO_ZOOM = 1.14;

/** MediaPipe model confidences. */
export const MIN_DETECTION_CONF = 0.5;
export const MIN_PRESENCE_CONF = 0.5;
export const MIN_TRACKING_CONF = 0.5;

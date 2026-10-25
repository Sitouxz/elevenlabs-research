// All gesture tuning lives here.
//
// Pinch is measured in the image plane: thumb-tip to index-tip distance divided
// by hand size, where hand size is the largest of several palm measurements so
// it doesn't shrink when the hand tilts toward the camera. On real photos of
// touching thumb+index this reads 0.05-0.25, versus ~0.9 for open/pointing
// hands. (The metric 3D ratio is far noisier: 0.08-0.85 for the same pinches,
// because MediaPipe's depth estimate is the weakest part of the model.)

/** Pinch closes below this ratio. */
export const PINCH_ON = 0.3;
/** Wider than PINCH_ON: hysteresis stops the pinch flickering at the threshold. */
export const PINCH_OFF = 0.5;
/** Above this a release is unambiguous and fires immediately (no debounce frame). */
export const PINCH_OFF_HARD = 0.75;
/**
 * If the 3D ratio says the tips are more than this far apart (palm sizes), the
 * thumb is just in front of / behind the index in the image: not a pinch.
 */
export const PINCH_DEPTH_VETO = 1.0;
/** Ratio at which the pinch-progress ring starts to fill. */
export const PINCH_HINT_START = 0.9;

/** Finger extension = |tip - wrist| / |mcp - wrist|. */
export const FINGER_EXTENDED = 1.6;
/** Ring/pinky below this count as tucked away (for the scroll pose). */
export const FINGER_CURLED = 1.35;
/**
 * A fist has all four fingers below this (measured 0.75-0.9). A pinch held
 * with the other fingers loosely curled has the index at 1.0-1.5, so this must
 * stay clearly under that or pinching would read as a fist.
 */
export const FIST_CURL = 1.1;
/** Hold a fist this long to leave gesture mode. */
export const FIST_EXIT_MS = 1500;

/**
 * Cursor sits where the pinch started this long ago, so the fingers closing
 * onto each other doesn't push the cursor off the target.
 */
export const PINCH_ANCHOR_LOOKBACK_MS = 100;

/** Movement (px) under which a pinch counts as a click rather than a drag. */
export const CLICK_SLOP_PX = 26;

/** Frames a scroll/fist pose must hold before it activates (kills flicker). */
export const POSE_STABLE_FRAMES = 2;

/**
 * Hand vanishes for less than this and any pinch/drag survives. Pinching makes
 * the fingers occlude each other, which is exactly when tracking drops out.
 */
export const LOST_GRACE_MS = 300;

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
 * Only this central part of the camera frame is mapped onto the screen (and is
 * what the backdrop shows), instead of the whole frame:
 *  - the hand never has to reach the frame edge to reach a screen edge, where
 *    it gets cut off and tracking dies;
 *  - the region sits near the TOP of the frame, so pointing at the bottom of the
 *    screen (where the control dock is) still leaves the wrist in frame.
 * Width is a fraction of the frame width; height follows the screen's aspect.
 */
export const REGION_WIDTH = 0.8;
export const REGION_TOP = 0.03;
/** Never use more than this fraction of the frame height. */
export const REGION_MAX_HEIGHT = 0.94;

/** Click assist: snap the cursor to a nearby control. */
export const SNAP_RADIUS_PX = 44;
/** Once snapped, the cursor stays until it is this far from the control. */
export const SNAP_STICKY_PX = 70;
/** No snapping while moving faster than this (px/s): don't snag on the way past. */
export const SNAP_MAX_SPEED = 650;
/** Controls up to this size snap to their centre; bigger ones just pull you inside. */
export const SNAP_CENTER_MAX_PX = 110;
/**
 * MediaPipe model confidences. Lower than the 0.5 default: a missed frame
 * costs more here than a rare phantom hand (pose logic ignores one-frame
 * noise), and a lower tracking floor keeps the hand locked mid-pinch, when
 * the fingers occlude each other.
 */
export const MIN_DETECTION_CONF = 0.35;
export const MIN_PRESENCE_CONF = 0.35;
export const MIN_TRACKING_CONF = 0.35;

/** Tile scan: square tile side as a fraction of the frame height. */
export const TILE_SIZE = 0.62;
/** ROI crop side = hand size * this. */
export const ROI_PAD = 2.8;
/** Hand taller than this (fraction of frame height): back to full-frame tracking. */
export const ROI_TO_FULLFRAME = 0.3;
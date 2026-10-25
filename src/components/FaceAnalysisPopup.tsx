import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, ScanFace, Palette, Shirt, User, Camera } from "lucide-react";
import type {
    FaceAnalysisResult,
    PersonAnalysis,
} from "../hooks/useFaceAnalysis";
import { CameraPreview } from "./CameraPreview";

interface FaceAnalysisPopupProps {
    isOpen: boolean;
    isAnalyzing: boolean;
    isPreviewing?: boolean;
    previewStream?: MediaStream | null;
    // Captured still available immediately after the frame grab — shown as the
    // background behind the analyzing loading overlay so the user can see their
    // face being scanned rather than a black box.
    capturedDataUrl?: string | null;
    result: FaceAnalysisResult | null;
    error: string;
    visible?: boolean;
    onClose: () => void;
}



// Map of descriptive color names → CSS-renderable hex values for the swatch.
const COLOR_SWATCH_MAP: Record<string, string> = {
    // Blues
    "icy blue": "#a8d8f0", "sky blue": "#87ceeb", "navy": "#001f5b",
    "navy blue": "#001f5b", "cobalt": "#0047ab", "cobalt blue": "#0047ab",
    "royal blue": "#4169e1", "powder blue": "#b0e0e6", "steel blue": "#4682b4",
    "teal": "#008080", "aqua": "#00ffff", "turquoise": "#40e0d0",
    "blue": "#4169e1", "light blue": "#add8e6", "dark blue": "#00008b",
    "cyan": "#00bcd4", "periwinkle": "#ccccff", "indigo": "#4b0082",
    "sapphire": "#0f52ba", "sapphire blue": "#0f52ba", "cerulean": "#007ba7",
    "cerulean blue": "#007ba7", "electric blue": "#7df9ff", "baby blue": "#89cff0",
    "cornflower blue": "#6495ed", "midnight blue": "#191970",
    "pale blue": "#d0e8f5", "soft blue": "#8ab4d4", "muted blue": "#7090a0",
    "dusty blue": "#7b9eae", "slate blue": "#6a7f9a", "ocean blue": "#006994",
    "deep blue": "#00008b", "bright blue": "#0070ff", "pastel blue": "#aec6cf",
    // Pinks
    "neon pink": "#ff6ec7", "hot pink": "#ff69b4", "dusty pink": "#dcb4b4",
    "blush pink": "#ffb6c1", "rose": "#ff007f", "mauve": "#c8a2c8",
    "fuchsia": "#ff00ff", "coral": "#ff7f50", "salmon": "#fa8072",
    "peach": "#ffcba4", "blush": "#de5d83", "baby pink": "#f4c2c2",
    "pink": "#ff69b4", "light pink": "#ffb6c1",
    "pastel pink": "#f8c8d4", "soft pink": "#f4b8c4", "pale pink": "#fadadd",
    "deep pink": "#ff1493", "bright pink": "#ff44aa", "muted pink": "#d4909a",
    "dusty rose": "#c9898e", "warm pink": "#e88fa0",
    // Purples
    "lavender": "#e6e6fa", "lilac": "#c8a2c8", "purple": "#800080",
    "violet": "#ee82ee", "plum": "#dda0dd", "magenta": "#ff00ff",
    "deep purple": "#4a148c", "orchid": "#da70d6",
    "pastel purple": "#c3a8e8", "soft purple": "#b89ecc", "pale purple": "#d8c4f0",
    "muted purple": "#9070a0", "eggplant": "#614051",
    "amethyst": "#9966cc", "wisteria": "#c9a0dc", "grape": "#6f2da8",
    "bright purple": "#9b30ff",
    // Greens
    "olive": "#808000", "sage": "#bcb88a", "emerald": "#50c878",
    "mint": "#98ff98", "forest green": "#228b22", "hunter green": "#355e3b",
    "jade": "#00a86b", "green": "#4caf50", "lime": "#cddc39",
    "dark green": "#1b5e20", "light green": "#8bc34a", "moss": "#8a9a5b",
    "seafoam": "#93e9be", "mint green": "#98ff98",
    "neon green": "#39ff14", "bright green": "#66ff00", "pale green": "#d0f0c0",
    "pastel green": "#b8e4b0", "soft green": "#90c8a0", "muted green": "#7a9e7e",
    "olive green": "#6b7a10", "deep green": "#006400", "moss green": "#8a9a5b",
    "sage green": "#bcb88a", "army green": "#4b5320", "pistachio": "#93c572",
    // Reds
    "burgundy": "#800020", "wine": "#722f37", "crimson": "#dc143c",
    "rust": "#b7410e", "terracotta": "#e2725b", "brick red": "#cb4154",
    "cherry": "#de3163", "red": "#f44336", "dark red": "#8b0000",
    "scarlet": "#ff2400", "maroon": "#800000",
    "deep burgundy": "#5c001a", "deep red": "#8b0000", "deep crimson": "#990000",
    "bright red": "#ff1a1a", "pale red": "#ff8888", "soft red": "#e07070",
    "muted red": "#b05050", "rose red": "#c21e56",
    // Oranges
    "burnt orange": "#cc5500", "tangerine": "#f28500", "amber": "#ffbf00",
    "gold": "#ffd700", "mustard": "#e4a010", "orange": "#ff9800",
    "dark orange": "#ff6d00",
    "deep orange": "#bf360c", "bright orange": "#ff6600", "pale orange": "#ffcc99",
    "soft orange": "#ffb366", "pumpkin": "#ff7518", "apricot": "#fbceb1",
    "mustard yellow": "#e3b505", "golden yellow": "#ffc300",
    // Yellows
    "lemon": "#fff44f", "cream": "#fffdd0", "ivory": "#fffff0",
    "champagne": "#f7e7ce", "butter": "#fbec5d", "yellow": "#ffeb3b",
    "pale yellow": "#ffff99",
    "bright yellow": "#ffee00", "neon yellow": "#ccff00", "soft yellow": "#fff3aa",
    "muted yellow": "#d4c060", "golden": "#ffd700", "canary": "#ffef00",
    "sunflower": "#ffda00", "pastel yellow": "#fdfd96",
    // Neutrals / Browns
    "camel": "#c19a6b", "tan": "#d2b48c", "beige": "#f5f5dc",
    "taupe": "#483c32", "khaki": "#c3b091", "sand": "#c2b280",
    "nude": "#e3bc9a", "brown": "#795548", "chocolate": "#7b3f00",
    "coffee": "#6f4e37", "mocha": "#967969", "espresso": "#4c3728",
    "caramel": "#c68642", "copper": "#b87333",
    "deep brown": "#3e1f00", "warm brown": "#8b5e3c", "pale brown": "#c4a882",
    // Peach
    "pale peach": "#fde8d8", "soft peach": "#f9d5c0", "deep peach": "#e8956d",
    "warm peach": "#f4a57a", "bright peach": "#ff9966",
    // Whites / Blacks / Grays
    "white": "#ffffff", "off-white": "#faf9f6", "off white": "#faf9f6",
    "black": "#000000", "charcoal": "#36454f", "slate": "#708090",
    "gray": "#808080", "grey": "#808080", "silver": "#c0c0c0",
    "light gray": "#d3d3d3", "light grey": "#d3d3d3",
    "dark gray": "#4a4a4a", "dark grey": "#4a4a4a",
    "pale gray": "#e8e8e8", "soft gray": "#c8c8c8", "warm gray": "#9e9589",
    "cool gray": "#8c92ac",
    // Misc
    "denim": "#1560bd", "rose gold": "#b76e79",
    "warm white": "#fdf5e6", "cool white": "#f0f8ff",
    "dusty lavender": "#b09fbc", "midnight": "#191970",
    "midnight green": "#004953", "electric purple": "#bf00ff",
    "electric pink": "#ff44cc",
};

// Given a compound color name not found in the map, find a known base color
// keyword within the name and use that hex as an approximation.
// e.g. "deep burgundy" → finds "burgundy" → "#800020"
// const resolveByKeyword = (lower: string): string | undefined => {
//     // Sorted longest-first so multi-word bases match before single-word ones
//     const BASES = [
//         "burgundy", "crimson", "scarlet", "maroon", "terracotta", "salmon",
//         "turquoise", "lavender", "periwinkle", "amethyst", "wisteria",
//         "sapphire", "cerulean", "cobalt", "indigo", "teal", "cyan",
//         "emerald", "seafoam", "pistachio",
//         "magenta", "fuchsia", "orchid", "violet", "lilac",
//         "orange", "amber", "mustard", "tangerine", "apricot",
//         "champagne", "ivory", "cream", "butter", "lemon",
//         "chocolate", "espresso", "mocha", "caramel", "camel",
//         "wine", "rose", "coral", "peach", "blush",
//         "gold", "copper", "bronze",
//         "navy", "denim",
//         "pink", "red", "blue", "green", "yellow", "purple",
//         "brown", "gray", "grey", "black", "white", "silver",
//         "beige", "tan",
//     ];
//     for (const base of BASES) {
//         if (lower.includes(base) && COLOR_SWATCH_MAP[base]) {
//             return COLOR_SWATCH_MAP[base];
//         }
//     }
//     return undefined;
// };

// Convert a hex colour to a human-readable name using the swatch map first,
// then falling back to an HSL-derived approximation.
const hexToColorName = (hex: string): string => {
    // Expand shorthand #ABC → #AABBCC
    const full =
        hex.length === 4
            ? "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
            : hex;
    const lower = full.toLowerCase();
    // Reverse-lookup in our swatch map
    for (const [name, h] of Object.entries(COLOR_SWATCH_MAP)) {
        if (h.toLowerCase() === lower) return name;
    }
    // Parse RGB → HSL approximation
    const r = parseInt(full.slice(1, 3), 16);
    const g = parseInt(full.slice(3, 5), 16);
    const b = parseInt(full.slice(5, 7), 16);
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    const l = (max + min) / 510;
    const s =
        max === min
            ? 0
            : l > 0.5
            ? (max - min) / (510 - max - min)
            : (max - min) / (max + min);
    if (s < 0.12) {
        if (l < 0.15) return "black";
        if (l < 0.4) return "dark gray";
        if (l < 0.65) return "gray";
        if (l < 0.85) return "silver";
        return "white";
    }
    let hue = 0;
    if (max === r) hue = ((g - b) / (max - min) + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / (max - min) + 2) * 60;
    else hue = ((r - g) / (max - min) + 4) * 60;
    const base =
        hue < 15 || hue >= 345 ? "red" :
        hue < 45  ? "orange" :
        hue < 75  ? "yellow" :
        hue < 150 ? "green" :
        hue < 195 ? "teal" :
        hue < 255 ? "blue" :
        hue < 285 ? "purple" :
        hue < 315 ? "magenta" : "pink";
    if (l < 0.3) return "dark " + base;
    if (l > 0.7) return "light " + base;
    return base;
};

// Strip/convert hex codes from the display label so only color names show.
const toDisplayLabel = (raw: string): string => {
    const trimmed = raw.trim();
    // Pure hex — convert to a readable name
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
        return hexToColorName(trimmed);
    }
    // Mixed string (name + embedded hex) — strip the hex fragment
    return trimmed.replace(/#[0-9a-f]{3,6}/gi, "").trim() || trimmed;
};

// Render a color chip. Accepts hex (#rrggbb) or a plain color name.
const ColorChip = ({ color }: { color: string }) => {
    const label = toDisplayLabel(color);
    return (
        <span className="inline-flex items-center px-2 py-1 rounded-full bg-white/5 border border-primary/15 text-[10px] font-mono text-gray-200">
            {label}
        </span>
    );
};

const PersonCard = ({
    person,
    index,
    totalPeople,
}: {
    person: PersonAnalysis;
    index: number;
    totalPeople: number;
}) => {
    // Only show the person header when there are multiple people.
    // Never show it for a single-person scan even if the AI returned a label.
    const showHeader = totalPeople > 1;
    return (
        <div className="glass-panel rounded-lg p-3 border border-primary/15 space-y-3">
            {showHeader && (
            <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
                <User size={13} className="text-primary" />
                <span className="text-[11px] font-mono font-extrabold tracking-wider text-primary/90 uppercase">
                    {person.label || `Person ${index + 1}`}
                </span>
            </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="flex flex-col">
                    <span className="text-gray-400 uppercase text-[9px] tracking-wider">
                        Age
                    </span>
                    <span className="text-gray-100">{person.age || "—"}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-gray-400 uppercase text-[9px] tracking-wider">
                        Gender
                    </span>
                    <span className="text-gray-100">{person.gender || "—"}</span>
                </div>
                {person.colorSeason && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 uppercase text-[9px] tracking-wider">
                            Color Season
                        </span>
                        <span className="text-gray-100">{person.colorSeason}</span>
                    </div>
                )}
                {person.skinTone && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 uppercase text-[9px] tracking-wider">
                            Skin Tone
                        </span>
                        <span className="text-gray-100">{person.skinTone}</span>
                    </div>
                )}
            </div>

            {person.matchedColors && person.matchedColors.length > 0 && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-primary/70 font-mono">
                        <Palette size={11} /> Best Colors
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {person.matchedColors.map((c, i) => (
                            <ColorChip key={i} color={c} />
                        ))}
                    </div>
                </div>
            )}

            {person.avoidColors && person.avoidColors.length > 0 && (
                <div className="space-y-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-red-400/70 font-mono">
                        Avoid
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {person.avoidColors.map((c, i) => (
                            <ColorChip key={i} color={c} />
                        ))}
                    </div>
                </div>
            )}

            {person.bestOutfit && (
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-primary/70 font-mono">
                        <Shirt size={11} /> Best Outfit
                    </div>
                    <p className="text-[11px] font-mono text-gray-200 leading-relaxed">
                        {person.bestOutfit}
                    </p>
                </div>
            )}

            {person.notes && (
                <p className="text-[10px] font-mono text-gray-400 italic leading-relaxed">
                    {person.notes}
                </p>
            )}
        </div>
    );
};

export const FaceAnalysisPopup = ({
    isOpen,
    isAnalyzing,
    isPreviewing = false,
    previewStream = null,
    capturedDataUrl = null,
    result,
    error,
    visible = true,
    onClose,
}: FaceAnalysisPopupProps) => {


    return (
        <div
            className="fixed inset-0 z-[45] pointer-events-none flex items-center justify-center p-4"
            aria-label="Face analysis"
        >
            <AnimatePresence>
                {visible && isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 12, transition: { duration: 0.15 } }}
                        transition={{ type: "spring", damping: 24, stiffness: 260 }}
                        className="glass-panel neon-border rounded-2xl overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.7)] pointer-events-auto flex flex-col w-full max-w-md max-h-[85vh]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-primary/20 bg-background-dark/60 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <ScanFace size={15} className="text-primary" />
                                <span className="text-xs font-mono font-extrabold tracking-widest text-primary/90 uppercase">
                                    Face Analysis
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                title="Close"
                                className="w-7 h-7 rounded flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">

                            {/* Camera frame area: live preview → analyzing overlay → captured still */}
                            <div className="relative rounded-xl overflow-hidden bg-black/50 aspect-video border border-primary/15">
                                {/* 1. Live preview (stream open, before capture) */}
                                {isPreviewing && previewStream && (
                                    <CameraPreview
                                        stream={previewStream}
                                        mirrored
                                        className="absolute inset-0 w-full h-full rounded-none border-none"
                                    />
                                )}

                                {/* 2. Captured still / analyzing background.
                                    Show it both during analysis (as background
                                    behind the loading overlay) and after (as
                                    the permanent result image). */}
                                {!isPreviewing && (result?.imageDataUrl || (isAnalyzing && capturedDataUrl)) && (
                                    <img
                                        src={result?.imageDataUrl ?? capturedDataUrl!}
                                        alt="Analyzed face"
                                        className="w-full h-full object-cover"
                                        style={{ transform: "scaleX(-1)" }}
                                    />
                                )}

                                {/* 3. Placeholder when nothing to show */}
                                {!isPreviewing && !result?.imageDataUrl && !isAnalyzing && !capturedDataUrl && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <ScanFace size={48} className="text-primary/20" />
                                    </div>
                                )}

                                {/* Analyzing overlay (after preview, before result). Semi-transparent
                                    so the captured face is visible in the background. */}
                                {isAnalyzing && (
                                    <div className="absolute inset-0 bg-background-dark/55 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3">

                                        <Loader2
                                            size={30}
                                            className="text-primary animate-spin"
                                        />
                                        <span className="text-[11px] font-mono text-primary/80 uppercase tracking-widest animate-pulse">
                                            Analyzing…
                                        </span>
                                        {/* Moving scan line */}
                                        <motion.div
                                            className="absolute left-0 right-0 h-0.5 bg-primary/70 shadow-[0_0_12px_#00eeff]"
                                            animate={{ top: ["8%", "92%", "8%"] }}
                                            transition={{
                                                duration: 2.4,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Preview overlay badge */}
                                {isPreviewing && (
                                    <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[10px] font-mono text-primary/90 tracking-widest uppercase">
                                            <Camera size={10} className="animate-pulse" />
                                            Capturing in 1s…
                                        </span>
                                    </div>
                                )}
                            </div>


                            {/* Error */}
                            {error && !isAnalyzing && (
                                <div className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/5">
                                    <p className="text-[11px] font-mono text-red-400">
                                        {error}
                                    </p>
                                </div>
                            )}

                            {/* Summary */}
                            {result?.summary && (
                                <div className="px-3 py-2.5 rounded-lg border border-primary/20 bg-primary/5">
                                    <p className="text-[11px] font-mono text-gray-100 leading-relaxed">
                                        {result.summary}
                                    </p>
                                </div>
                            )}

                            {/* Per-person cards */}
                            {result?.people && result.people.length > 0 && (
                                <div className="space-y-3">
                    {result.people.map((p, i) => (
                        <PersonCard key={i} person={p} index={i} totalPeople={result.people.length} />
                    ))}
                                </div>
                            )}

                            {/* No-people state */}
                            {!isAnalyzing &&
                                result &&
                                result.people.length === 0 &&
                                !error && (
                                    <p className="text-[11px] font-mono text-gray-400 text-center py-4">
                                        No person was clearly visible in the frame.
                                    </p>
                                )}
                        </div>

                        {/* Footer */}
                        {result && (
                            <div className="px-4 py-2 border-t border-primary/10 flex-shrink-0">
                                <span className="text-[9px] font-mono text-primary/30">
                                    {new Date(result.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

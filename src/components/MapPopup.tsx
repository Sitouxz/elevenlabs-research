import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { X, MapPin } from "lucide-react";
import type { MapPopupState } from "../hooks/useMapPopup";

// Vite bundles Leaflet's marker images under a hashed path, which breaks the
// library's own CSS-relative lookup — point it at the bundled URLs instead.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface MapPopupProps {
  popup: MapPopupState | null;
  visible?: boolean;
  onClose: () => void;
}

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 380;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 220;
const HEADER_HEIGHT = 33;

type DragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Top edge is skipped — the header directly above already serves as the
// move handle, so a resize strip there would fight it for the same pixels.
const RESIZE_EDGES: { mode: DragMode; className: string; cursor: string }[] = [
  { mode: "s", className: "bottom-0 left-2 right-2 h-1.5", cursor: "ns-resize" },
  { mode: "w", className: "left-0 top-2 bottom-2 w-1.5", cursor: "ew-resize" },
  { mode: "e", className: "right-0 top-2 bottom-2 w-1.5", cursor: "ew-resize" },
  { mode: "se", className: "bottom-0 right-0 w-3 h-3", cursor: "nwse-resize" },
  { mode: "sw", className: "bottom-0 left-0 w-3 h-3", cursor: "nesw-resize" },
];

export const MapPopup = ({ popup, visible = true, onClose }: MapPopupProps) => {
  const [rect, setRect] = useState<Rect>(() => {
    const width = DEFAULT_WIDTH;
    const x =
      typeof window !== "undefined" ? Math.max(16, window.innerWidth - width - 24) : 100;
    return { x, y: 96, width, height: DEFAULT_HEIGHT };
  });

  // ponytail: drag-to-move and drag-to-resize share one pointer-tracking
  // effect instead of framer-motion's drag (which only handles translation,
  // not resize) — mode says which edges the current gesture moves.
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; startRect: Rect } | null>(
    null,
  );

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (drag.mode === "move") {
        setRect({ ...drag.startRect, x: drag.startRect.x + dx, y: drag.startRect.y + dy });
        return;
      }

      const next = { ...drag.startRect };
      if (drag.mode.includes("e")) {
        next.width = Math.max(MIN_WIDTH, drag.startRect.width + dx);
      }
      if (drag.mode.includes("s")) {
        next.height = Math.max(MIN_HEIGHT, drag.startRect.height + dy);
      }
      if (drag.mode.includes("w")) {
        next.width = Math.max(MIN_WIDTH, drag.startRect.width - dx);
        next.x = drag.startRect.x + (drag.startRect.width - next.width);
      }
      if (drag.mode.includes("n")) {
        next.height = Math.max(MIN_HEIGHT, drag.startRect.height - dy);
        next.y = drag.startRect.y + (drag.startRect.height - next.height);
      }
      setRect(next);
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  const beginDrag = useCallback(
    (mode: DragMode) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startRect: rect };
    },
    [rect],
  );

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!popup || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, { attributionControl: true });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    if (popup.result.kind === "location") {
      const { lat, lon } = popup.result.location;
      L.marker([lat, lon]).addTo(map);
      map.setView([lat, lon], 12);
    } else {
      const { origin, destination } = popup.result;
      const originLatLng: L.LatLngTuple = [origin.lat, origin.lon];
      const destLatLng: L.LatLngTuple = [destination.lat, destination.lon];
      L.marker(originLatLng).addTo(map);
      L.marker(destLatLng).addTo(map);
      L.polyline([originLatLng, destLatLng], { color: "#00eeff", weight: 3, dashArray: "6 6" }).addTo(
        map,
      );
      map.fitBounds(L.latLngBounds([originLatLng, destLatLng]), { padding: [32, 32] });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [popup]);

  // Leaflet sizes its tiles off the container's dimensions at init time —
  // tell it to re-measure whenever a resize drag changes the container.
  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [rect.width, rect.height]);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none" aria-label="Map popup">
      <AnimatePresence>
        {visible && popup && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: "spring", damping: 22, stiffness: 240 }}
            style={{
              position: "fixed",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }}
            className="glass-panel rounded-xl overflow-hidden neon-border shadow-[0_20px_60px_rgba(0,0,0,0.6)] pointer-events-auto flex flex-col"
          >
            <div
              onPointerDown={beginDrag("move")}
              className="flex items-center justify-between px-3 py-2 border-b border-primary/20 bg-background-dark/60 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
              style={{ height: HEADER_HEIGHT }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <MapPin size={12} className="text-primary flex-shrink-0" />
                <span className="text-[10px] font-mono text-primary/80 uppercase tracking-wider truncate">
                  {popup.result.kind === "location"
                    ? popup.result.location.displayName
                    : `${popup.result.origin.displayName} → ${popup.result.destination.displayName}`}
                </span>
              </div>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                title="Close"
                className="w-6 h-6 rounded flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            <div className="relative flex-1 bg-black/70">
              <div ref={mapContainerRef} className="absolute inset-0" />

              {popup.result.kind === "distance" && (
                <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-background-dark/80 border-t border-primary/20 text-[10px] font-mono text-primary/70 z-[1000]">
                  Straight-line distance: {popup.result.distanceKm.toFixed(1)} km
                </div>
              )}

              {RESIZE_EDGES.map(({ mode, className, cursor }) => (
                <div
                  key={mode}
                  onPointerDown={beginDrag(mode)}
                  className={`absolute z-[1001] ${className}`}
                  style={{ cursor }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

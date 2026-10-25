import { AnimatePresence } from "framer-motion";
import { ObjectViewer } from "./ObjectViewer";
import type { ObjectWindow } from "../hooks/useObjectScan";

interface ObjectViewerManagerProps {
    windows: ObjectWindow[];
    visible?: boolean;
    onClose: (id: string) => void;
    onFocus: (id: string) => void;
    onPositionChange: (
        id: string,
        position: { x: number; y: number }
    ) => void;
}

export const ObjectViewerManager = ({
    windows,
    visible = true,
    onClose,
    onFocus,
    onPositionChange,
}: ObjectViewerManagerProps) => {
    if (!visible) return null;

    return (
        <div
            // Full-screen overlay layer for 3D viewer windows. pointer-events
            // are disabled on the layer so the app stays interactive; each
            // window re-enables its own. z-31 sits just above image windows.
            className="fixed inset-0 z-[31] pointer-events-none"
            aria-label="3D object viewer windows"
        >
            <AnimatePresence>
                {windows.map((w) => (
                    <ObjectViewer
                        key={w.id}
                        window={w}
                        onClose={onClose}
                        onFocus={onFocus}
                        onPositionChange={onPositionChange}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
};

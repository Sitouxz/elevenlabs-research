import { AnimatePresence } from "framer-motion";
import { ImageWindow } from "./ImageWindow";
import type { ImageWindow as ImageWindowType } from "../hooks/useImageGeneration";

interface ImageWindowManagerProps {
    windows: ImageWindowType[];
    onClose: (id: string) => void;
    onFocus: (id: string) => void;
    onPositionChange: (
        id: string,
        position: { x: number; y: number }
    ) => void;
}

export const ImageWindowManager = ({
    windows,
    onClose,
    onFocus,
    onPositionChange,
}: ImageWindowManagerProps) => {
    return (
        <div
            // Fixed full-screen overlay layer for windows. pointer-events:none
            // so the underlying app stays interactive; individual windows
            // re-enable their own pointer events.
            className="fixed inset-0 z-30 pointer-events-none"
            aria-label="Image generation windows"
        >
            <AnimatePresence>
                {windows.map((w) => (
                    <ImageWindow
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

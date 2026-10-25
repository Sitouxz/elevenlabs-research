import { AnimatePresence, motion } from "framer-motion";
import { X, ScanLine, ScanFace, RefreshCw, Camera } from "lucide-react";
import { CameraPreview } from "./CameraPreview";


interface SettingsSidebarProps {
    isOpen: boolean;
    devices: MediaDeviceInfo[];
    objectCameraId: string;
    faceCameraId: string;
    onObjectCameraChange: (id: string) => void;
    onFaceCameraChange: (id: string) => void;
    onRefreshDevices: () => void;
    onClose: () => void;
}

// A labeled camera <select>. When permission hasn't been granted the browser
// returns blank labels, so we synthesize a readable fallback per device index.
const CameraSelect = ({
    id,
    value,
    devices,
    onChange,
}: {
    id: string;
    value: string;
    devices: MediaDeviceInfo[];
    onChange: (id: string) => void;
}) => (
    <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background-dark/70 border border-primary/25 rounded-lg px-3 py-2 text-[11px] font-mono text-gray-100 focus:outline-none focus:border-primary/60 transition-colors"
    >
        <option value="">System default (front camera)</option>
        {devices.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
            </option>
        ))}
    </select>
);

export const SettingsSidebar = ({
    isOpen,
    devices,
    objectCameraId,
    faceCameraId,
    onObjectCameraChange,
    onFaceCameraChange,
    onRefreshDevices,
    onClose,
}: SettingsSidebarProps) => {
    return (
        <>
            {/* Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
                    />
                )}
            </AnimatePresence>

            {/* Sliding panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.aside
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 260 }}
                        className="fixed top-0 left-0 h-full w-[300px] max-w-[85vw] z-[61] glass-panel border-r border-primary/25 shadow-[10px_0_40px_rgba(0,0,0,0.6)] flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3.5 border-b border-primary/20 bg-background-dark/60">
                            <div className="flex items-center gap-2">
                                <Camera size={15} className="text-primary" />
                                <span className="text-xs font-mono font-extrabold tracking-widest text-primary/90 uppercase">
                                    Camera Settings
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                title="Close (A)"
                                className="w-7 h-7 rounded flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

                            {/* Object-scan camera */}
                            <div className="space-y-2">
                                <label
                                    htmlFor="object-camera"
                                    className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-primary/80"
                                >
                                    <ScanLine size={13} /> Object Scan Camera
                                </label>
                                <p className="text-[10px] font-mono text-gray-400 leading-relaxed">
                                    Used for live vision and 3D object scanning.
                                </p>
                                <CameraSelect
                                    id="object-camera"
                                    value={objectCameraId}
                                    devices={devices}
                                    onChange={onObjectCameraChange}
                                />
                                {/* Live preview of the selected object camera */}
                                <CameraPreview
                                    deviceId={objectCameraId || undefined}
                                    active={isOpen}
                                    mirrored
                                    className="w-full aspect-video mt-1"
                                />
                            </div>

                            {/* Face-capture camera */}
                            <div className="space-y-2">
                                <label
                                    htmlFor="face-camera"
                                    className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-primary/80"
                                >
                                    <ScanFace size={13} /> Face Capture Camera
                                </label>
                                <p className="text-[10px] font-mono text-gray-400 leading-relaxed">
                                    Used when you say "scan my face and analyze".
                                </p>
                                <CameraSelect
                                    id="face-camera"
                                    value={faceCameraId}
                                    devices={devices}
                                    onChange={onFaceCameraChange}
                                />
                                {/* Live preview of the selected face camera */}
                                <CameraPreview
                                    deviceId={faceCameraId || undefined}
                                    active={isOpen}
                                    mirrored
                                    className="w-full aspect-video mt-1"
                                />
                            </div>


                            {/* Refresh */}
                            <button
                                onClick={onRefreshDevices}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-primary/25 text-[10px] font-mono uppercase tracking-wider text-primary/70 hover:text-primary hover:border-primary/50 transition-colors"
                            >
                                <RefreshCw size={12} /> Refresh Camera List
                            </button>

                            {devices.length === 0 && (
                                <p className="text-[10px] font-mono text-yellow-400/70 leading-relaxed">
                                    No cameras detected yet. Turn the camera on
                                    once (button or “C”) to grant permission, then
                                    refresh.
                                </p>
                            )}
                        </div>

                        {/* Footer hint */}
                        <div className="px-4 py-3 border-t border-primary/10">
                            <span className="text-[9px] font-mono text-primary/40 tracking-wider">
                                Press A or the gear icon to toggle this panel.
                            </span>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>
        </>
    );
};

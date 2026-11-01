import { useEffect, useRef } from "react";
import { VideoOff } from "lucide-react";

interface CameraPreviewProps {
    // A device to open a fresh preview stream for (used by the settings
    // sidebar). Empty string = system default front camera.
    deviceId?: string;
    // OR an already-open stream to display directly (used by the face-analysis
    // popup so it shows the exact stream that will be captured).
    stream?: MediaStream | null;
    // Only open a device stream when active (keeps cameras off until the panel
    // is visible). Ignored when `stream` is provided.
    active?: boolean;
    mirrored?: boolean;
    className?: string;
}

// A tiny live-camera preview. Two modes:
//   1. Pass `stream` to render an existing MediaStream directly.
//   2. Pass `deviceId` + `active` to open (and clean up) its own stream.
export const CameraPreview = ({
    deviceId,
    stream,
    active = true,
    mirrored = false,
    className = "",
}: CameraPreviewProps) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const ownStreamRef = useRef<MediaStream | null>(null);
    const errorRef = useRef(false);

    // Mode 1: display a provided stream.
    useEffect(() => {
        if (stream === undefined) return; // not in "provided stream" mode
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream ?? null;
        if (stream) {
            video.play().catch(() => {});
        }
    }, [stream]);

    // Mode 2: open our own stream for a device while active.
    useEffect(() => {
        if (stream !== undefined) return; // provided-stream mode owns the video
        let cancelled = false;

        const stop = () => {
            if (ownStreamRef.current) {
                ownStreamRef.current.getTracks().forEach((t) => t.stop());
                ownStreamRef.current = null;
            }
            if (videoRef.current) videoRef.current.srcObject = null;
        };

        if (!active) {
            stop();
            return;
        }

        errorRef.current = false;
        (async () => {
            try {
                const constraints: MediaStreamConstraints = {
                    video: deviceId
                        ? { deviceId: { exact: deviceId } }
                        : { facingMode: "user" },
                };
                const s = await navigator.mediaDevices.getUserMedia(constraints);
                if (cancelled) {
                    s.getTracks().forEach((t) => t.stop());
                    return;
                }
                ownStreamRef.current = s;
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                    await videoRef.current.play().catch(() => {});
                }
            } catch (err) {
                console.warn("[CameraPreview] failed to open device:", err);
                errorRef.current = true;
            }
        })();

        return () => {
            cancelled = true;
            stop();
        };
    }, [deviceId, active, stream]);

    const showPlaceholder = stream === undefined ? !active : !stream;

    return (
        <div
            className={`relative rounded-lg overflow-hidden bg-black/50 border border-primary/15 ${className}`}
        >
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={mirrored ? { transform: "scaleX(-1)" } : undefined}
            />
            {showPlaceholder && (
                <div className="absolute inset-0 flex items-center justify-center text-primary/25">
                    <VideoOff size={26} />
                </div>
            )}
        </div>
    );
};

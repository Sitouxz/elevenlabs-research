import { useState, useCallback, useRef, useEffect } from "react";

// localStorage keys for persisting which physical camera the user assigned to
// each role (object-scan vs face-capture) across reloads.
const LS_OBJECT_CAMERA = "flare.objectCameraId";
const LS_FACE_CAMERA = "flare.faceCameraId";

const readStored = (key: string): string => {
    if (typeof window === "undefined") return "";
    try {
        return window.localStorage.getItem(key) || "";
    } catch {
        return "";
    }
};

const writeStored = (key: string, value: string) => {
    if (typeof window === "undefined") return;
    try {
        if (value) window.localStorage.setItem(key, value);
        else window.localStorage.removeItem(key);
    } catch {
        // ignore quota / privacy-mode failures
    }
};

export const useCamera = () => {
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // ---------------------------------------------------------------------
    // Multi-camera support. The user can pick, in the settings sidebar, which
    // physical camera feeds the object-scan/vision pipeline and which one is
    // used to capture their face for the "scan face and analyze" flow.
    // Both selections persist in localStorage. When a role is left empty we
    // fall back to the browser default (facingMode: user).
    // ---------------------------------------------------------------------
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [objectCameraId, setObjectCameraIdState] = useState<string>(() =>
        readStored(LS_OBJECT_CAMERA)
    );
    const [faceCameraId, setFaceCameraIdState] = useState<string>(() =>
        readStored(LS_FACE_CAMERA)
    );

    // Keep the latest selection in a ref so startCamera (a stable callback)
    // always opens the currently-assigned object camera without re-creating.
    const objectCameraIdRef = useRef(objectCameraId);
    useEffect(() => {
        objectCameraIdRef.current = objectCameraId;
    }, [objectCameraId]);

    const setObjectCameraId = useCallback((id: string) => {
        setObjectCameraIdState(id);
        writeStored(LS_OBJECT_CAMERA, id);
    }, []);

    const setFaceCameraId = useCallback((id: string) => {
        setFaceCameraIdState(id);
        writeStored(LS_FACE_CAMERA, id);
    }, []);

    // Enumerate available video-input devices. Labels are only populated after
    // camera permission has been granted at least once, so callers may want to
    // refresh again right after startCamera().
    const refreshDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            const cams = all.filter((d) => d.kind === "videoinput");
            setDevices(cams);
            return cams;
        } catch (error) {
            console.error("Failed to enumerate cameras:", error);
            return [];
        }
    }, []);

    useEffect(() => {
        // Best-effort initial enumeration (labels may be blank pre-permission).
        refreshDevices();
        // Re-enumerate whenever a camera is plugged/unplugged.
        const handler = () => refreshDevices();
        navigator.mediaDevices?.addEventListener?.("devicechange", handler);
        return () => {
            navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
        };
    }, [refreshDevices]);

    // Open a fresh MediaStream for a specific device (or the default front
    // camera when no deviceId is given). Shared by the object-scan camera and
    // the face-capture flow so both honor the user's device assignments.
    const openStreamForDevice = useCallback(
        async (deviceId?: string): Promise<MediaStream> => {
            const video: MediaTrackConstraints = deviceId
                ? {
                      deviceId: { exact: deviceId },
                      width: { ideal: 1920 },
                      height: { ideal: 1080 },
                      frameRate: { ideal: 30 },
                  }
                : {
                      facingMode: "user",
                      width: { min: 1280, ideal: 1920, max: 4096 },
                      height: { min: 720, ideal: 1080, max: 2160 },
                      frameRate: { ideal: 30 },
                  };
            return navigator.mediaDevices.getUserMedia({ video });
        },
        []
    );

    const startCamera = useCallback(async () => {
        try {
            // Prefer the user-assigned object-scan camera; fall back to the
            // default front camera if none is set or the exact device fails.
            let stream: MediaStream;
            try {
                stream = await openStreamForDevice(
                    objectCameraIdRef.current || undefined
                );
            } catch (err) {
                console.warn(
                    "Assigned object camera unavailable, using default:",
                    err
                );
                stream = await openStreamForDevice(undefined);
            }

            setCameraStream(stream);
            setIsCameraOn(true);

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            // Labels are now available (permission granted) — refresh so the
            // settings dropdowns show real camera names instead of blanks.
            refreshDevices();
        } catch (error) {
            console.error("Failed to start camera:", error);
        }
    }, [openStreamForDevice, refreshDevices]);

    const stopCamera = useCallback(() => {
        if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
            setCameraStream(null);
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsCameraOn(false);
    }, [cameraStream]);

    const toggleCamera = useCallback(async () => {
        if (isCameraOn) {
            stopCamera();
        } else {
            await startCamera();
        }
    }, [isCameraOn, startCamera, stopCamera]);

    // Restart the live object-scan camera with a newly-selected device while
    // it's already running, so switching the assignment takes effect at once.
    const restartObjectCamera = useCallback(async () => {
        if (!isCameraOn) return;
        stopCamera();
        // Give the previous tracks a beat to release before re-acquiring.
        await new Promise((r) => setTimeout(r, 150));
        await startCamera();
    }, [isCameraOn, startCamera, stopCamera]);

    const captureFrame = useCallback((): HTMLCanvasElement | null => {
        const video = videoRef.current;
        if (!video || !isCameraOn || video.readyState < 2) return null;

        let canvas = canvasRef.current;
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvasRef.current = canvas;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0);
        return canvas;
    }, [isCameraOn]);

    return {
        isCameraOn,
        cameraStream,
        videoRef,
        startCamera,
        stopCamera,
        toggleCamera,
        captureFrame,
        // Multi-camera settings
        devices,
        refreshDevices,
        objectCameraId,
        setObjectCameraId,
        faceCameraId,
        setFaceCameraId,
        openStreamForDevice,
        restartObjectCamera,
    };
};

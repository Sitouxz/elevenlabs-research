import { useState, useCallback, useRef } from "react";

export const useCamera = () => {
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user",
                },
            });
            setCameraStream(stream);
            setIsCameraOn(true);

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
        } catch (error) {
            console.error("Failed to start camera:", error);
        }
    }, []);

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
    };
};

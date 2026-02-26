import { useState, useCallback, useRef, useEffect } from "react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as mobilenet from "@tensorflow-models/mobilenet";
import Tesseract from "tesseract.js";

export interface Detection {
    label: string;
    score: number;
    bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface Classification {
    className: string;
    probability: number;
}

export interface VisionResult {
    detections: Detection[];
    classifications: Classification[];
    description: string;
    timestamp: number;
}

export const useVision = () => {
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [isModelReady, setIsModelReady] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isOcrRunning, setIsOcrRunning] = useState(false);
    const [lastResult, setLastResult] = useState<VisionResult | null>(null);
    const [ocrText, setOcrText] = useState<string>("");
    const [objectCount, setObjectCount] = useState(0);

    const cocoModelRef = useRef<cocoSsd.ObjectDetection | null>(null);
    const mobilenetModelRef = useRef<mobilenet.MobileNet | null>(null);
    const lastDescriptionRef = useRef<string>("");
    const analysisLoopRef = useRef<number | null>(null);

    const loadModels = useCallback(async () => {
        if (isModelReady || isModelLoading) return;
        setIsModelLoading(true);

        try {
            await tf.ready();
            const [cocoModel, mobileModel] = await Promise.all([
                cocoSsd.load({ base: "lite_mobilenet_v2" }),
                mobilenet.load({ version: 2, alpha: 0.5 }),
            ]);
            cocoModelRef.current = cocoModel;
            mobilenetModelRef.current = mobileModel;
            setIsModelReady(true);
            console.log("Vision models loaded successfully");
        } catch (error) {
            console.error("Failed to load vision models:", error);
        } finally {
            setIsModelLoading(false);
        }
    }, [isModelReady, isModelLoading]);

    const unloadModels = useCallback(() => {
        cocoModelRef.current = null;
        mobilenetModelRef.current = null;
        setIsModelReady(false);
        setLastResult(null);
        setObjectCount(0);
        lastDescriptionRef.current = "";
    }, []);

    const detectObjects = useCallback(
        async (
            source: HTMLVideoElement | HTMLCanvasElement
        ): Promise<Detection[]> => {
            if (!cocoModelRef.current) return [];
            try {
                const predictions = await cocoModelRef.current.detect(source);
                return predictions.map((p) => ({
                    label: p.class,
                    score: p.score,
                    bbox: p.bbox as [number, number, number, number],
                }));
            } catch {
                return [];
            }
        },
        []
    );

    const classifyImage = useCallback(
        async (
            source: HTMLVideoElement | HTMLCanvasElement
        ): Promise<Classification[]> => {
            if (!mobilenetModelRef.current) return [];
            try {
                const predictions =
                    await mobilenetModelRef.current.classify(source);
                return predictions.map((p) => ({
                    className: p.className,
                    probability: p.probability,
                }));
            } catch {
                return [];
            }
        },
        []
    );

    const recognizeText = useCallback(
        async (source: HTMLCanvasElement): Promise<string> => {
            setIsOcrRunning(true);
            try {
                const result = await Tesseract.recognize(source, "eng");
                const text = result.data.text.trim();
                setOcrText(text);
                return text;
            } catch (error) {
                console.error("OCR failed:", error);
                return "";
            } finally {
                setIsOcrRunning(false);
            }
        },
        []
    );

    const composeDescription = useCallback(
        (
            detections: Detection[],
            classifications: Classification[],
            ocrResult?: string
        ): string => {
            const parts: string[] = [];

            // Group and count detected objects
            if (detections.length > 0) {
                const objectCounts: Record<string, number> = {};
                for (const d of detections) {
                    if (d.score > 0.5) {
                        objectCounts[d.label] =
                            (objectCounts[d.label] || 0) + 1;
                    }
                }
                const objectList = Object.entries(objectCounts)
                    .map(([label, count]) =>
                        count > 1 ? `${count} ${label}s` : `a ${label}`
                    )
                    .join(", ");
                if (objectList) {
                    parts.push(`I can see ${objectList}`);
                }
            }

            // Top classification
            if (classifications.length > 0 && classifications[0].probability > 0.3) {
                const topClass = classifications[0].className
                    .split(",")[0]
                    .trim();
                parts.push(`The scene appears to contain: ${topClass}`);
            }

            // OCR text
            if (ocrResult && ocrResult.length > 2) {
                parts.push(`Detected text: "${ocrResult.substring(0, 200)}"`);
            }

            if (parts.length === 0) {
                return "No significant objects detected in view.";
            }

            return parts.join(". ") + ".";
        },
        []
    );

    const analyzeFrame = useCallback(
        async (
            source: HTMLVideoElement | HTMLCanvasElement,
            includeOcr = false
        ): Promise<VisionResult | null> => {
            if (!isModelReady || isAnalyzing) return null;
            setIsAnalyzing(true);

            try {
                const [detections, classifications] = await Promise.all([
                    detectObjects(source),
                    classifyImage(source),
                ]);

                let ocrResult: string | undefined;
                if (includeOcr && source instanceof HTMLCanvasElement) {
                    ocrResult = await recognizeText(source);
                }

                const description = composeDescription(
                    detections,
                    classifications,
                    ocrResult
                );
                const result: VisionResult = {
                    detections,
                    classifications,
                    description,
                    timestamp: Date.now(),
                };

                setLastResult(result);
                setObjectCount(
                    detections.filter((d) => d.score > 0.5).length
                );

                return result;
            } catch (error) {
                console.error("Frame analysis failed:", error);
                return null;
            } finally {
                setIsAnalyzing(false);
            }
        },
        [
            isModelReady,
            isAnalyzing,
            detectObjects,
            classifyImage,
            recognizeText,
            composeDescription,
        ]
    );

    const hasSceneChanged = useCallback(
        (newDescription: string): boolean => {
            if (!lastDescriptionRef.current) return true;
            // Simple change detection: compare descriptions
            const changed =
                newDescription !== lastDescriptionRef.current &&
                newDescription !== "No significant objects detected in view.";
            if (changed) {
                lastDescriptionRef.current = newDescription;
            }
            return changed;
        },
        []
    );

    const startAnalysisLoop = useCallback(
        (
            getSource: () => HTMLVideoElement | null,
            onUpdate: (description: string) => void,
            intervalMs = 2000
        ) => {
            if (analysisLoopRef.current) return;

            const loop = async () => {
                const source = getSource();
                if (!source || !isModelReady) {
                    analysisLoopRef.current = window.setTimeout(
                        loop,
                        intervalMs
                    );
                    return;
                }

                const result = await analyzeFrame(source);
                if (result && hasSceneChanged(result.description)) {
                    onUpdate(result.description);
                }

                analysisLoopRef.current = window.setTimeout(
                    loop,
                    intervalMs
                );
            };

            loop();
        },
        [isModelReady, analyzeFrame, hasSceneChanged]
    );

    const stopAnalysisLoop = useCallback(() => {
        if (analysisLoopRef.current) {
            clearTimeout(analysisLoopRef.current);
            analysisLoopRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopAnalysisLoop();
        };
    }, [stopAnalysisLoop]);

    return {
        isModelLoading,
        isModelReady,
        isAnalyzing,
        isOcrRunning,
        lastResult,
        ocrText,
        objectCount,
        loadModels,
        unloadModels,
        analyzeFrame,
        recognizeText,
        composeDescription,
        startAnalysisLoop,
        stopAnalysisLoop,
        hasSceneChanged,
    };
};

import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  const __APP_VERSION__: string;
}

// -----------------------------------------------------------------------------
// <model-viewer> custom element (from @google/model-viewer) used by
// ObjectViewer to render generated .glb 3D models. React 19's automatic JSX
// runtime resolves intrinsic elements via the `react` module's own JSX
// namespace, so we augment that (not the global JSX namespace) for the web
// component and its attributes to be recognised without type errors.
// -----------------------------------------------------------------------------
type ModelViewerAttributes = DetailedHTMLProps<
  HTMLAttributes<HTMLElement> & {
    src?: string;
    alt?: string;
    poster?: string;
    "camera-controls"?: boolean | string;
    "auto-rotate"?: boolean | string;
    "auto-rotate-delay"?: number | string;
    "rotation-per-second"?: string;
    "shadow-intensity"?: number | string;
    "environment-image"?: string;
    "camera-orbit"?: string;
    "field-of-view"?: string;
    exposure?: number | string;
    ar?: boolean | string;
    "interaction-prompt"?: string;
    loading?: string;
    reveal?: string;
  },
  HTMLElement
>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}

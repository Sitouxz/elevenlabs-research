import { useCallback, useState } from "react";
import { findLocation, findDistance, type MapResult } from "../utils/map";

export interface MapPopupState {
  result: MapResult;
}

// ponytail: one popup at a time (last query replaces the previous one) —
// unlike image/video generation, map lookups resolve instantly and users
// don't ask for several at once, so no windows array / z-index stacking.
export const useMapPopup = () => {
  const [popup, setPopup] = useState<MapPopupState | null>(null);

  const showLocation = useCallback(async (query: string): Promise<string> => {
    try {
      const result = await findLocation(query);
      setPopup({ result });
      return `Showing ${result.location.displayName} on the map.`;
    } catch (err) {
      return err instanceof Error ? err.message : "I couldn't find that location.";
    }
  }, []);

  const showDistance = useCallback(
    async (origin: string, destination: string): Promise<string> => {
      try {
        const result = await findDistance(origin, destination);
        setPopup({ result });
        return (
          `${result.origin.displayName} to ${result.destination.displayName} is about ` +
          `${result.distanceKm.toFixed(1)} km in a straight line.`
        );
      } catch (err) {
        return err instanceof Error ? err.message : "I couldn't calculate that distance.";
      }
    },
    [],
  );

  const close = useCallback(() => setPopup(null), []);

  return { popup, showLocation, showDistance, close };
};

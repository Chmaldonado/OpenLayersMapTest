import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    ReactNode,
} from "react";
import * as mgrs from "mgrs";

/* ============================================================
   Types
   ============================================================ */

export type MarkerData = {
    id: string;
    lat: number;
    lon: number;
    mgrs: string;
    timestamp: number; // Might be useful later for sorting or analytics
};

export type ZoneData = {
    id: string;
    name: string;
    coordinates: Array<[number, number]>; // [lon, lat] — careful with order
    riskScore: number;
    reason?: string;
    owner?: string;
};

type MapDataContextType = {
    // ---- Marker operations ----
    markers: Map<string, MarkerData>;
    addMarker: (lat: number, lon: number, mgrsText?: string) => string;
    removeMarker: (id: string) => void;
    getMarker: (id: string) => MarkerData | undefined;
    getAllMarkers: () => MarkerData[];
    clearMarkers: () => void;

    // ---- Zone operations ----
    zones: Map<string, ZoneData>;
    getZone: (id: string) => ZoneData | undefined;
    getAllZones: () => ZoneData[];
};

const MapDataContext = createContext<MapDataContextType | null>(null);

/* ============================================================
   Utilities
   ============================================================ */

// Simple ID generator. Not bulletproof, but totally fine for UI usage.
function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
}

/* ============================================================
   Provider
   ============================================================ */

export function MapDataProvider({ children }: { children: ReactNode }) {
    // Using Map instead of object because:
    // 1. Easy .size
    // 2. Clean deletes
    // 3. Preserves insertion order
    const [markers, setMarkers] = useState(new Map<string, MarkerData>());
    const [zones, setZones] = useState(new Map<string, ZoneData>());

    // Refs allow stable getter functions without causing re-renders
    const markersRef = useRef(markers);
    const zonesRef = useRef(zones);

    // Keep refs synced on every render
    markersRef.current = markers;
    zonesRef.current = zones;

    /* ---------------- Marker Logic ---------------- */

    const addMarker = useCallback(
        (lat: number, lon: number, mgrsText?: string) => {
            const id = generateId("marker");

            // Compute MGRS if not provided
            const markerMgrs =
                mgrsText ?? (mgrs.forward([lon, lat], 5) as string);

            const markerData: MarkerData = {
                id,
                lat,
                lon,
                mgrs: markerMgrs,
                timestamp: Date.now(),
            };

            // Important: create a new Map instance so React detects change
            setMarkers((prev) => {
                const next = new Map(prev);
                next.set(id, markerData);
                return next;
            });

            return id;
        },
        []
    );

    const removeMarker = useCallback((id: string) => {
        setMarkers((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const getMarker = useCallback((id: string) => {
        return markersRef.current.get(id);
    }, []);

    const getAllMarkers = useCallback(() => {
        return Array.from(markersRef.current.values());
    }, []);

    const clearMarkers = useCallback(() => {
        setMarkers(new Map());
    }, []);

    /* ---------------- Zone Logic ---------------- */

    // Zones are currently read-only
    const getZone = useCallback((id: string) => {
        return zonesRef.current.get(id);
    }, []);

    const getAllZones = useCallback(() => {
        return Array.from(zonesRef.current.values());
    }, []);

    /* ---------------- Context Value ---------------- */

    const value: MapDataContextType = {
        markers,
        addMarker,
        removeMarker,
        getMarker,
        getAllMarkers,
        clearMarkers,
        zones,
        getZone,
        getAllZones,
    };

    return (
        <MapDataContext.Provider value={value}>
            {children}
        </MapDataContext.Provider>
    );
}

/* ============================================================
   Hook
   ============================================================ */

export function useMapData() {
    const ctx = useContext(MapDataContext);

    if (!ctx) {
        throw new Error(
            "useMapData must be used within a MapDataProvider"
        );
    }

    return ctx;
}

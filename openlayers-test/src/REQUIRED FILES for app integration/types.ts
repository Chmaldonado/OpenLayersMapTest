/* ============================================================
   Coordinate Types
   ============================================================ */

/**
 * OpenLayers works in [lon, lat] order.
 * This is easy to forget, so keeping the alias explicit helps.
 */
export type LonLat = [number, number]; // [longitude, latitude]

/**
 * Most humans think in [lat, lon].
 * We use this for UI-facing callbacks and events.
 */
export type LatLon = [number, number]; // [latitude, longitude]



/* ============================================================
   Feature Property Types (Discriminated Unions)
   ============================================================ */

/**
 * Marker feature stored inside OpenLayers.
 * `type` is the discriminator — this enables safe type narrowing.
 */
export type MarkerFeature = {
    id: string;
    type: "marker";
    name: string;
    lonLat: LonLat;
    mgrs: string | null; // nullable in case it's not computed yet
};

/**
 * Zone feature (polygon).
 * Coordinates are kept in lon/lat because OL expects that order.
 */
export type ZoneFeature = {
    id: string;
    type: "zone";
    name: string;
    riskScore: number;
    reason?: string;
    owner?: string;
    coordinates: LonLat[];
};

/**
 * Heatmap feature.
 * Weight determines intensity in the HeatmapLayer.
 */
export type HeatFeature = {
    id: string;
    type: "heat";
    name: string;
    weight: number;
    lonLat: LonLat;
};

/**
 * Union of all possible feature property shapes.
 * The `type` field is what makes narrowing work.
 */
export type FeatureProperties =
    | MarkerFeature
    | ZoneFeature
    | HeatFeature;



/* ============================================================
   Map Events (Lightweight Event System)
   ============================================================ */

/**
 * Instead of passing full objects through events,
 * we pass minimal info (IDs + coordinates).
 * The consumer can query the central store for details.
 *
 * This keeps events small and avoids accidental heavy payloads.
 */
export type MapEvent =
    | {
        type: "markerAdded";
        coordinates: LatLon; // [lat, lon]
        markerId: string;
    }
    | {
        type: "markerRemoved";
        markerId: string;
        coordinates: LatLon;
    }
    | {
        type: "zoneClicked";
        zoneId: string;
        coordinates: LatLon;
    }
    | {
        type: "featureClicked";
        featureType: "marker" | "zone" | "heat";
        featureId: string;
        coordinates: LatLon;
    };



/* ============================================================
   Supporting / Compatibility Types
   ============================================================ */

/**
 * Basic HUD info emitted by the map.
 */
export type OLInfo = {
    zoom: number;
    centerLatLon: LatLon;
};

/**
 * Request object for programmatic navigation.
 */
export type GoToRequest = {
    lat: number;
    lon: number;
    zoom?: number;
    dropMarker?: boolean;
    mgrs?: string; // optional override
};



/* ============================================================
   Component Props
   ============================================================ */

/**
 * Props for OpenLayersTest component.
 * This keeps the component flexible without bloating it.
 */
export type OpenLayersTestProps = {
    showZones: boolean;
    showMarkers: boolean;
    showHeatIncidents: boolean;

    goToRequest?: GoToRequest | null;

    onInfo?: (info: OLInfo) => void;
    onLastClick?: (latLon: LatLon | null) => void;
    onMarkersCount?: (count: number) => void;

    // Centralized event handler (cleaner than many small callbacks)
    onMapEvent?: (event: MapEvent) => void;

    requestClearMarkers?: number;

    seedZones?: Array<{
        name: string;
        coordinates: LonLat[];
        riskScore: number;
        reason?: string;
        owner?: string;
    }>;

    seedHeatPoints?: Array<{
        lon: number;
        lat: number;
        weight: number;
        name?: string;
    }>;
};



/* ============================================================
   Type Guards
   ============================================================ */

/**
 * These are runtime-safe narrowing helpers.
 * Very useful when pulling properties off OL features.
 */

export function isMarkerFeature(
    props: FeatureProperties
): props is MarkerFeature {
    return props.type === "marker";
}

export function isZoneFeature(
    props: FeatureProperties
): props is ZoneFeature {
    return props.type === "zone";
}

export function isHeatFeature(
    props: FeatureProperties
): props is HeatFeature {
    return props.type === "heat";
}

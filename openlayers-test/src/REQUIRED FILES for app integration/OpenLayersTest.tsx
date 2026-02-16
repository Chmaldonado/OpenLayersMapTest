import React, { useEffect, useRef } from "react";
import * as mgrs from "mgrs";

import Map from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import VectorLayer from "ol/layer/Vector.js";
import HeatmapLayer from "ol/layer/Heatmap.js";
import XYZ from "ol/source/XYZ.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import Overlay from "ol/Overlay.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import Style from "ol/style/Style.js";
import Icon from "ol/style/Icon.js";
import Stroke from "ol/style/Stroke.js";
import Fill from "ol/style/Fill.js";
import Text from "ol/style/Text.js";
import type MapBrowserEvent from "ol/MapBrowserEvent.js";

// Types + type guards
import type {
    FeatureProperties,
    MarkerFeature,
    ZoneFeature,
    HeatFeature,
    OpenLayersTestProps,
    LonLat,
    LatLon,
} from "./types";
import { isMarkerFeature, isZoneFeature } from "./types";

// Central store (markers are the “source of truth” for the rest of the app)
import { useMapData } from "./MapDataContext";

/* ============================================================
   Config / constants
   ============================================================ */

// Base tile server (OpenStreetMap)
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Default start view (Atlanta-ish)
const DEFAULT_CENTER: LonLat = [-84.39, 33.75];
const DEFAULT_ZOOM = 12;

// Fly-to animation duration when goToRequest is triggered
const ANIMATION_DURATION = 650;

// Heatmap tuning knobs (play with these to change look/feel)
const HEATMAP_CONFIG = {
    blur: 26,
    radius: 16,
} as const;

// Risk styling buckets for zone polygons
const RISK_COLORS = {
    high: {
        threshold: 80,
        fill: "rgba(255, 59, 48, 0.06)",
        stroke: "rgba(255, 59, 48, 1)",
    },
    medium: {
        threshold: 60,
        fill: "rgba(255, 149, 0, 0.05)",
        stroke: "rgba(255, 149, 0, 1)",
    },
    low: {
        threshold: 40,
        fill: "rgba(255, 204, 0, 0.04)",
        stroke: "rgba(255, 204, 0, 1)",
    },
    minimal: {
        threshold: 0,
        fill: "rgba(52, 199, 89, 0.035)",
        stroke: "rgba(52, 199, 89, 1)",
    },
} as const;

// Inline popup “card” styling.
// Kept here so we don’t need a CSS file just for a small tooltip.
const POPUP_STYLE = {
    background: "rgba(30,30,30,0.95)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    padding: "10px 12px",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    minWidth: "220px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    pointerEvents: "auto",
} as const;

// Marker icon as inline SVG so we don't deal with asset imports
const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
  <path fill="#ff3b30" d="M12 2c-3.314 0-6 2.686-6 6c0 4.5 6 14 6 14s6-9.5 6-14c0-3.314-2.686-6-6-6z"/>
  <circle cx="12" cy="8" r="2.3" fill="#ffffff"/>
</svg>
`;

/* ============================================================
   Helpers / styling
   ============================================================ */

/**
 * Convert SVG markup to a data URI that OpenLayers Icon can use.
 * (Keeps everything self-contained.)
 */
function svgDataUri(svg: string): string {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

/**
 * Marker icon style.
 * Kept in a function so it's easy to reuse.
 */
function markerStyle(): Style {
    return new Style({
        image: new Icon({
            src: svgDataUri(PIN_SVG),
            anchor: [0.5, 1], // bottom-center of icon sits at the point
            scale: 1,
        }),
    });
}

/**
 * Color lookup for zone polygons based on risk score.
 * Very basic "bucket thresholds" logic.
 */
function getRiskColor(score: number, type: "fill" | "stroke"): string {
    if (score >= RISK_COLORS.high.threshold) return RISK_COLORS.high[type];
    if (score >= RISK_COLORS.medium.threshold) return RISK_COLORS.medium[type];
    if (score >= RISK_COLORS.low.threshold) return RISK_COLORS.low[type];
    return RISK_COLORS.minimal[type];
}

/**
 * Zone polygon style: outline + fill + label.
 * If the map gets crowded, label rendering is the first thing I'd revisit.
 */
function polygonRiskStyle(name: string, score: number): Style {
    return new Style({
        stroke: new Stroke({ width: 2, color: getRiskColor(score, "stroke") }),
        fill: new Fill({ color: getRiskColor(score, "fill") }),
        text: new Text({
            text: `${name}\nRisk ${score}`,
            font: "bold 12px system-ui, sans-serif",
            fill: new Fill({ color: "rgba(0,0,0,0.9)" }),
            stroke: new Stroke({ color: "rgba(255,255,255,0.95)", width: 3 }),
            offsetY: -6,
        }),
    });
}

/**
 * Create one heatmap feature.
 * HeatmapLayer reads `weight` from feature properties (we set it explicitly).
 */
function makeHeatPoint(
    id: string,
    lon: number,
    lat: number,
    weight: number,
    name?: string
): Feature {
    const feature = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
    });

    feature.setId(id);
    feature.set("weight", weight);

    const props: HeatFeature = {
        id,
        type: "heat",
        name: name ?? "Incident",
        weight,
        lonLat: [lon, lat],
    };

    feature.setProperties(props);
    return feature;
}

/* ============================================================
   Popup HTML helpers
   ============================================================ */

/**
 * Marker popup HTML.
 * Small note: markerData has timestamp too, but we aren't displaying it right now.
 */
function createMarkerPopupHTML(
    marker: MarkerFeature,
    markerData: { mgrs: string; timestamp: number }
): string {
    const [lon, lat] = marker.lonLat;

    return `
    <div style="font-weight:800; margin-bottom:6px;">${marker.name}</div>
    <div style="opacity:.9; margin-bottom:4px;">
      Lat/Lon: <b>${lat.toFixed(5)}, ${lon.toFixed(5)}</b>
    </div>
    <div style="opacity:.9; margin-bottom:6px;">MGRS: <b>${markerData.mgrs}</b></div>
    <div style="opacity:.7;">Right-click to delete</div>
  `;
}

function createZonePopupHTML(zone: ZoneFeature): string {
    return `
    <div style="font-weight:800; margin-bottom:6px;">${zone.name}</div>
    <div style="margin-bottom:6px;">Risk Score: <b>${zone.riskScore}</b></div>
    ${zone.reason ? `<div style="margin-bottom:6px;">Reason: ${zone.reason}</div>` : ""}
    ${zone.owner ? `<div style="opacity:.85;">Owner: ${zone.owner}</div>` : ""}
  `;
}

/* ============================================================
   Main Component
   ============================================================ */

export default function OpenLayersTest(props: OpenLayersTestProps) {
    const {
        showZones,
        showMarkers,
        showHeatIncidents,
        onInfo,
        onLastClick,
        onMarkersCount,
        onMapEvent,
        requestClearMarkers,
        goToRequest,
        seedZones,
        seedHeatPoints,
    } = props;

    // Centralized store
    const { markers, addMarker, removeMarker, getMarker, clearMarkers } = useMapData();

    // DOM node OpenLayers mounts into
    const mapDivRef = useRef<HTMLDivElement | null>(null);

    // OL Map instance
    const mapRef = useRef<Map | null>(null);

    // Vector sources (hold features)
    const zonesSourceRef = useRef(new VectorSource());
    const markersSourceRef = useRef(new VectorSource());
    const heatSourceRef = useRef(new VectorSource());

    // Layers (render the sources)
    const zonesLayerRef = useRef(new VectorLayer({ source: zonesSourceRef.current }));
    const markersLayerRef = useRef(new VectorLayer({ source: markersSourceRef.current }));
    const heatLayerRef = useRef(
        new HeatmapLayer({
            source: heatSourceRef.current,
            blur: HEATMAP_CONFIG.blur,
            radius: HEATMAP_CONFIG.radius,
        })
    );

    // Popup overlay references
    const popupElRef = useRef<HTMLDivElement | null>(null);
    const popupOverlayRef = useRef<Overlay | null>(null);

    /**
     * Map initialization:
     * - create map + layers
     * - create popup overlay
     * - seed zones and heat points
     * - wire up click handlers
     *
     * NOTE: Dependency list intentionally mirrors your original file
     * so we don't change when the map re-initializes.
     */
    useEffect(() => {
        if (!mapDivRef.current) return;

        const mapDiv = mapDivRef.current;

        // Disable native browser context menu (right click) on the map div.
        // We still use OL "contextmenu" event for marker deletion.
        const preventContextMenu = (e: MouseEvent) => e.preventDefault();
        mapDiv.addEventListener("contextmenu", preventContextMenu);

        // Base tiles
        const raster = new TileLayer({
            source: new XYZ({ url: TILE_URL, maxZoom: 19 }),
        });

        // Camera view
        const view = new View({
            center: fromLonLat(DEFAULT_CENTER),
            zoom: DEFAULT_ZOOM,
        });

        // Create the OL map instance
        const map = new Map({
            target: mapDiv,
            layers: [raster, heatLayerRef.current, zonesLayerRef.current, markersLayerRef.current],
            view,
        });

        // Popup overlay element
        const popupEl = document.createElement("div");
        Object.assign(popupEl.style, POPUP_STYLE);

        const popup = new Overlay({
            element: popupEl,
            positioning: "bottom-center",
            stopEvent: true, // clicks inside popup don't pass through to the map
            offset: [0, -14],
        });

        map.addOverlay(popup);
        popupElRef.current = popupEl;
        popupOverlayRef.current = popup;

        /* ---------------- Seed zones ---------------- */

        const zonesToSeed =
            seedZones ?? [
                {
                    name: "Zone A",
                    coordinates: [
                        [-84.42, 33.74],
                        [-84.36, 33.74],
                        [-84.36, 33.77],
                        [-84.42, 33.77],
                        [-84.42, 33.74],
                    ] as LonLat[],
                    riskScore: 82,
                    reason: "N/A",
                },
            ];

        zonesToSeed.forEach((zone, index) => {
            const id = `zone-${index}`;

            // Polygon expects projected coordinates
            const polygon = new Polygon([zone.coordinates.map((coord) => fromLonLat(coord))]);
            const feature = new Feature(polygon);

            const zoneProps: ZoneFeature = {
                id,
                type: "zone",
                name: zone.name,
                riskScore: zone.riskScore,
                reason: zone.reason,
                owner: zone.owner,
                coordinates: zone.coordinates,
            };

            feature.setId(id);
            feature.setProperties(zoneProps);
            feature.setStyle(polygonRiskStyle(zone.name, zone.riskScore));

            zonesSourceRef.current.addFeature(feature);
        });

        /* ---------------- Seed heat points ---------------- */

        const heatPointsToSeed =
            seedHeatPoints ?? [
                { lon: -84.395, lat: 33.755, weight: 0.9, name: "Incident Cluster 1" },
                { lon: -84.392, lat: 33.752, weight: 0.8, name: "Incident Cluster 1" },
                { lon: -84.388, lat: 33.754, weight: 0.7, name: "Incident Cluster 1" },
                { lon: -84.405, lat: 33.765, weight: 1.0, name: "Incident Cluster 2" },
                { lon: -84.401, lat: 33.763, weight: 0.8, name: "Incident Cluster 2" },
                { lon: -84.41, lat: 33.748, weight: 0.65, name: "Incident Cluster 3" },
            ];

        heatSourceRef.current.addFeatures(
            heatPointsToSeed.map((pt, i) =>
                makeHeatPoint(`heat-${i}`, pt.lon, pt.lat, pt.weight, pt.name)
            )
        );

        /* ---------------- HUD / info updates ---------------- */

        const updateInfo = () => {
            const zoom = view.getZoom() ?? 0;

            // view.getCenter() returns projected coords; we convert back to lon/lat
            const centerLonLat = toLonLat(view.getCenter() ?? fromLonLat(DEFAULT_CENTER)) as LonLat;

            // The app wants [lat, lon]
            const centerLatLon: LatLon = [centerLonLat[1], centerLonLat[0]];
            onInfo?.({ zoom, centerLatLon });
        };

        map.on("moveend", updateInfo);
        updateInfo();

        /* ---------------- Left click: popup OR add marker ---------------- */

        const clickHandler = (evt: MapBrowserEvent<UIEvent>) => {
            const lonLat = toLonLat(evt.coordinate) as LonLat; // [lon, lat]
            const latLon: LatLon = [lonLat[1], lonLat[0]]; // [lat, lon]

            onLastClick?.(latLon);

            // If we clicked a feature, OpenLayers gives it to us.
            const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, (f) => f) as Feature | undefined;

            // If a feature was clicked AND we have popup refs, show something.
            if (clickedFeature && popupElRef.current && popupOverlayRef.current) {
                const props = clickedFeature.getProperties() as FeatureProperties;

                // Generic "feature clicked" event
                onMapEvent?.({
                    type: "featureClicked",
                    featureType: props.type,
                    featureId: props.id,
                    coordinates: latLon,
                });

                // Marker clicked
                if (isMarkerFeature(props)) {
                    const markerData = getMarker(props.id);

                    if (markerData) {
                        popupElRef.current.innerHTML = createMarkerPopupHTML(props, markerData);
                    } else {
                        // Fallback: show from feature props (store might be briefly out of sync)
                        popupElRef.current.innerHTML = `
              <div style="font-weight:800; margin-bottom:6px;">${props.name}</div>
              <div style="opacity:.9; margin-bottom:4px;">
                Lat/Lon: <b>${props.lonLat[1].toFixed(5)}, ${props.lonLat[0].toFixed(5)}</b>
              </div>
              ${props.mgrs ? `<div style="opacity:.9; margin-bottom:6px;">MGRS: <b>${props.mgrs}</b></div>` : ""}
              <div style="opacity:.7;">Right-click to delete</div>
            `;
                    }

                    popupOverlayRef.current.setPosition(evt.coordinate);
                    return; // don't also drop a marker
                }

                // Zone clicked
                if (isZoneFeature(props)) {
                    onMapEvent?.({
                        type: "zoneClicked",
                        zoneId: props.id,
                        coordinates: latLon,
                    });

                    popupElRef.current.innerHTML = createZonePopupHTML(props);
                    popupOverlayRef.current.setPosition(evt.coordinate);
                    return;
                }
            } else {
                // Clicked empty space: hide popup
                popupOverlayRef.current?.setPosition(undefined);
            }

            // Only add markers if the markers layer is enabled/visible
            if (!markersLayerRef.current.getVisible()) return;

            // mgrs.forward expects [lon, lat]
            const markerMgrs = mgrs.forward([lonLat[0], lonLat[1]], 5) as string;

            // Store uses (lat, lon, mgrs) in that order
            const markerId = addMarker(latLon[0], latLon[1], markerMgrs);

            // Create OL feature for marker rendering
            const marker = new Feature({
                geometry: new Point(fromLonLat(lonLat)),
            });

            const markerProps: MarkerFeature = {
                id: markerId,
                type: "marker",
                name: "Marker",
                lonLat,
                mgrs: markerMgrs,
            };

            marker.setId(markerId);
            marker.setProperties(markerProps);
            marker.setStyle(markerStyle());

            markersSourceRef.current.addFeature(marker);

            onMapEvent?.({
                type: "markerAdded",
                coordinates: latLon,
                markerId,
            });
        };

        /* ---------------- Right click: delete marker ---------------- */

        const contextMenuHandler = (evt: MapBrowserEvent<UIEvent>) => {
            // Don't delete if markers layer isn't visible (feels weird)
            if (!markersLayerRef.current.getVisible()) return;

            const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, (f) => f) as Feature | undefined;
            if (!clickedFeature) return;

            const props = clickedFeature.getProperties() as FeatureProperties;
            if (!isMarkerFeature(props)) return;

            const markerId = props.id;

            const [lon, lat] = props.lonLat;
            const latLon: LatLon = [lat, lon];

            // 1) update store
            removeMarker(markerId);

            // 2) update map layer
            markersSourceRef.current.removeFeature(clickedFeature);
            popupOverlayRef.current?.setPosition(undefined);

            onMapEvent?.({
                type: "markerRemoved",
                markerId,
                coordinates: latLon,
            });
        };

        map.on("singleclick", clickHandler);
        map.on("contextmenu", contextMenuHandler);

        mapRef.current = map;

        // Cleanup on unmount / re-init
        return () => {
            map.un("singleclick", clickHandler);
            map.un("contextmenu", contextMenuHandler);
            map.un("moveend", updateInfo);

            mapDiv.removeEventListener("contextmenu", preventContextMenu);

            map.setTarget(undefined);

            mapRef.current = null;
            popupElRef.current = null;
            popupOverlayRef.current = null;
        };
    }, [seedZones, seedHeatPoints]);

    /* ============================================================
       Side effects driven by props / store
       ============================================================ */

    // Keep parent updated on marker count changes
    useEffect(() => {
        onMarkersCount?.(markers.size);
    }, [markers.size, onMarkersCount]);

    // Toggle layers based on UI props
    useEffect(() => {
        zonesLayerRef.current.setVisible(showZones);
    }, [showZones]);

    useEffect(() => {
        markersLayerRef.current.setVisible(showMarkers);
    }, [showMarkers]);

    useEffect(() => {
        heatLayerRef.current.setVisible(showHeatIncidents);
    }, [showHeatIncidents]);

    // External clear marker request (triggered by parent)
    useEffect(() => {
        if (requestClearMarkers == null) return;

        clearMarkers(); // store
        markersSourceRef.current.clear(); // map
        popupOverlayRef.current?.setPosition(undefined);
    }, [requestClearMarkers, clearMarkers]);

    // External "go to" request (fly to location, optionally drop a marker)
    useEffect(() => {
        if (!goToRequest || !mapRef.current) return;

        const { lat, lon, zoom = 15, dropMarker, mgrs: mgrsText } = goToRequest;
        const view = mapRef.current.getView();
        const coord = fromLonLat([lon, lat]);

        view.animate({ center: coord, zoom, duration: ANIMATION_DURATION });

        if (!dropMarker) return;
        if (!markersLayerRef.current.getVisible()) return;

        const lonLat: LonLat = [lon, lat];

        // Use provided mgrs if present, otherwise compute it
        const markerMgrs = mgrsText ?? (mgrs.forward(lonLat, 5) as string);

        // Add to centralized store
        const markerId = addMarker(lat, lon, markerMgrs);

        // Add to OL layer
        const marker = new Feature({ geometry: new Point(coord) });

        const markerProps: MarkerFeature = {
            id: markerId,
            type: "marker",
            name: "Marker",
            lonLat,
            mgrs: markerMgrs,
        };

        marker.setId(markerId);
        marker.setProperties(markerProps);
        marker.setStyle(markerStyle());
        markersSourceRef.current.addFeature(marker);

        onMapEvent?.({
            type: "markerAdded",
            coordinates: [lat, lon],
            markerId,
        });
    }, [goToRequest]);

    // OpenLayers renders into this div
    return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}

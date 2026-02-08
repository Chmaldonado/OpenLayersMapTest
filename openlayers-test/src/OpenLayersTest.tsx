import React, { useEffect, useRef } from "react";

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

// Constants
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_CENTER: [number, number] = [-84.39, 33.75]; // [lon, lat]
const DEFAULT_ZOOM = 12;
const ANIMATION_DURATION = 650;

// Heatmap configuration
const HEATMAP_CONFIG = {
    blur: 26,
    radius: 16,
} as const;

// Risk color thresholds
const RISK_COLORS = {
    high: { threshold: 80, fill: "rgba(255, 59, 48, 0.06)", stroke: "rgba(255, 59, 48, 1)" },
    medium: { threshold: 60, fill: "rgba(255, 149, 0, 0.05)", stroke: "rgba(255, 149, 0, 1)" },
    low: { threshold: 40, fill: "rgba(255, 204, 0, 0.04)", stroke: "rgba(255, 204, 0, 1)" },
    minimal: { threshold: 0, fill: "rgba(52, 199, 89, 0.035)", stroke: "rgba(52, 199, 89, 1)" },
} as const;

// Popup styling
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

// Types
export type OLInfo = {
    zoom: number;
    centerLatLon: [number, number]; // [lat, lon]
};

export type GoToRequest = {
    lat: number;
    lon: number;
    zoom?: number;
    dropMarker?: boolean;
    mgrs?: string;
};

export type OpenLayersTestProps = {
    showZones: boolean;
    showMarkers: boolean;
    showHeatIncidents: boolean;
    goToRequest?: GoToRequest | null;
    onInfo?: (info: OLInfo) => void;
    onLastClick?: (latLon: [number, number] | null) => void;
    onMarkersCount?: (count: number) => void;
    requestClearMarkers?: number;
    seedZones?: Array<{
        name: string;
        coordinates: Array<[number, number]>; // [lon, lat]
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

type FeatureProps = {
    type?: "marker" | "zone" | "heat";
    name?: string;
    lonLat?: [number, number]; // [lon, lat]
    mgrs?: string | null;
    riskScore?: number;
    reason?: string;
    owner?: string;
};

// Utility Functions
function svgDataUri(svg: string): string {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
  <path fill="#ff3b30" d="M12 2c-3.314 0-6 2.686-6 6c0 4.5 6 14 6 14s6-9.5 6-14c0-3.314-2.686-6-6-6z"/>
  <circle cx="12" cy="8" r="2.3" fill="#ffffff"/>
</svg>
`;

// Styling Functions
function markerStyle(): Style {
    return new Style({
        image: new Icon({
            src: svgDataUri(PIN_SVG),
            anchor: [0.5, 1],
            scale: 1,
        }),
    });
}

function getRiskColor(score: number, type: "fill" | "stroke"): string {
    if (score >= RISK_COLORS.high.threshold) return RISK_COLORS.high[type];
    if (score >= RISK_COLORS.medium.threshold) return RISK_COLORS.medium[type];
    if (score >= RISK_COLORS.low.threshold) return RISK_COLORS.low[type];
    return RISK_COLORS.minimal[type];
}

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

function makeHeatPoint(lon: number, lat: number, weight: number, name?: string): Feature {
    const feature = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
    });
    feature.set("weight", weight);
    feature.setProperties({ type: "heat", name: name ?? "Incident" });
    return feature;
}

// Popup HTML Generators
function createMarkerPopupHTML(props: FeatureProps, name: string): string {
    const lonLat = props.lonLat!;
    return `
    <div style="font-weight:800; margin-bottom:6px;">${name}</div>
    <div style="opacity:.9; margin-bottom:4px;">
      Lat/Lon: <b>${lonLat[1].toFixed(5)}, ${lonLat[0].toFixed(5)}</b>
    </div>
    ${props.mgrs ? `<div style="opacity:.9; margin-bottom:6px;">MGRS: <b>${props.mgrs}</b></div>` : ""}
    <div style="opacity:.7;">Right-click to delete</div>
  `;
}

function createZonePopupHTML(props: FeatureProps, name: string): string {
    const { riskScore, reason, owner } = props;
    return `
    <div style="font-weight:800; margin-bottom:6px;">${name}</div>
    ${typeof riskScore === "number" ? `<div style="margin-bottom:6px;">Risk Score: <b>${riskScore}</b></div>` : ""}
    ${reason ? `<div style="margin-bottom:6px;">Reason: ${reason}</div>` : ""}
    ${owner ? `<div style="opacity:.85;">Owner: ${owner}</div>` : ""}
  `;
}

// Main Component
export default function OpenLayersTest(props: OpenLayersTestProps) {
    const {
        showZones,
        showMarkers,
        showHeatIncidents,
        onInfo,
        onLastClick,
        onMarkersCount,
        requestClearMarkers,
        goToRequest,
        seedZones,
        seedHeatPoints,
    } = props;

    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Map | null>(null);

    // Sources
    const zonesSourceRef = useRef(new VectorSource());
    const markersSourceRef = useRef(new VectorSource());
    const heatSourceRef = useRef(new VectorSource());

    // Layers
    const zonesLayerRef = useRef(new VectorLayer({ source: zonesSourceRef.current }));
    const markersLayerRef = useRef(new VectorLayer({ source: markersSourceRef.current }));
    const heatLayerRef = useRef(
        new HeatmapLayer({
            source: heatSourceRef.current,
            blur: HEATMAP_CONFIG.blur,
            radius: HEATMAP_CONFIG.radius,
        })
    );

    // Popup overlay
    const popupElRef = useRef<HTMLDivElement | null>(null);
    const popupOverlayRef = useRef<Overlay | null>(null);

    const markersCountRef = useRef(0);

    // Initialize map
    useEffect(() => {
        if (!mapDivRef.current) return;

        const mapDiv = mapDivRef.current;
        const preventContextMenu = (e: MouseEvent) => e.preventDefault();
        mapDiv.addEventListener("contextmenu", preventContextMenu);

        const raster = new TileLayer({
            source: new XYZ({ url: TILE_URL, maxZoom: 19 }),
        });

        const view = new View({
            center: fromLonLat(DEFAULT_CENTER),
            zoom: DEFAULT_ZOOM,
        });

        const map = new Map({
            target: mapDiv,
            layers: [raster, heatLayerRef.current, zonesLayerRef.current, markersLayerRef.current],
            view,
        });

        // Create and configure popup overlay
        const popupEl = document.createElement("div");
        Object.assign(popupEl.style, POPUP_STYLE);

        const popup = new Overlay({
            element: popupEl,
            positioning: "bottom-center",
            stopEvent: true,
            offset: [0, -14],
        });

        map.addOverlay(popup);
        popupElRef.current = popupEl;
        popupOverlayRef.current = popup;

        // Seed zones (use props or default)
        const zonesToSeed = seedZones ?? [
            {
                name: "Zone A",
                coordinates: [
                    [-84.42, 33.74],
                    [-84.36, 33.74],
                    [-84.36, 33.77],
                    [-84.42, 33.77],
                    [-84.42, 33.74],
                ],
                riskScore: 82,
                reason: "N/A",
            },
        ];

        zonesToSeed.forEach((zone) => {
            const feature = new Feature(
                new Polygon([zone.coordinates.map((coord) => fromLonLat(coord))])
            );
            feature.setProperties({
                type: "zone",
                name: zone.name,
                riskScore: zone.riskScore,
                reason: zone.reason,
                owner: zone.owner,
            });
            feature.setStyle(polygonRiskStyle(zone.name, zone.riskScore));
            zonesSourceRef.current.addFeature(feature);
        });

        // Seed heat points (use props or default)
        const heatPointsToSeed = seedHeatPoints ?? [
            { lon: -84.395, lat: 33.755, weight: 0.9, name: "Incident Cluster 1" },
            { lon: -84.392, lat: 33.752, weight: 0.8, name: "Incident Cluster 1" },
            { lon: -84.388, lat: 33.754, weight: 0.7, name: "Incident Cluster 1" },
            { lon: -84.405, lat: 33.765, weight: 1.0, name: "Incident Cluster 2" },
            { lon: -84.401, lat: 33.763, weight: 0.8, name: "Incident Cluster 2" },
            { lon: -84.41, lat: 33.748, weight: 0.65, name: "Incident Cluster 3" },
        ];

        heatSourceRef.current.addFeatures(
            heatPointsToSeed.map((pt) => makeHeatPoint(pt.lon, pt.lat, pt.weight, pt.name))
        );

        // Update HUD info
        const updateInfo = () => {
            const zoom = view.getZoom() ?? 0;
            const center = toLonLat(view.getCenter() ?? fromLonLat(DEFAULT_CENTER)) as [number, number];
            onInfo?.({ zoom, centerLatLon: [center[1], center[0]] });
        };
        map.on("moveend", updateInfo);
        updateInfo();

        // Left click handler: show popup or drop marker
        const clickHandler = (evt: MapBrowserEvent<UIEvent>) => {
            const lonLat = toLonLat(evt.coordinate) as [number, number];
            onLastClick?.([lonLat[1], lonLat[0]]);

            const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, (f) => f) as Feature | undefined;

            if (clickedFeature && popupElRef.current && popupOverlayRef.current) {
                const props = clickedFeature.getProperties() as FeatureProps;
                const type = props?.type ?? "unknown";
                const name = props?.name ?? "Feature";

                if (type === "marker" && props?.lonLat) {
                    popupElRef.current.innerHTML = createMarkerPopupHTML(props, name);
                    popupOverlayRef.current.setPosition(evt.coordinate);
                    return;
                }

                if (type === "zone") {
                    popupElRef.current.innerHTML = createZonePopupHTML(props, name);
                    popupOverlayRef.current.setPosition(evt.coordinate);
                    return;
                }
            } else {
                popupOverlayRef.current?.setPosition(undefined);
            }

            // Drop marker only if markers layer is visible
            if (!markersLayerRef.current.getVisible()) return;

            const marker = new Feature({ geometry: new Point(fromLonLat(lonLat)) });
            marker.setProperties({ type: "marker", name: "Marker", lonLat });
            marker.setStyle(markerStyle());
            markersSourceRef.current.addFeature(marker);

            markersCountRef.current += 1;
            onMarkersCount?.(markersCountRef.current);
        };

        // Right click handler: delete marker
        const contextMenuHandler = (evt: MapBrowserEvent<UIEvent>) => {
            if (!markersLayerRef.current.getVisible()) return;

            const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, (f) => f) as Feature | undefined;
            if (!clickedFeature) return;

            const props = clickedFeature.getProperties() as FeatureProps;
            if (props?.type !== "marker") return;

            markersSourceRef.current.removeFeature(clickedFeature);
            markersCountRef.current = Math.max(0, markersCountRef.current - 1);
            onMarkersCount?.(markersCountRef.current);
            popupOverlayRef.current?.setPosition(undefined);
        };

        map.on("singleclick", clickHandler);
        map.on("contextmenu", contextMenuHandler);
        mapRef.current = map;

        // Cleanup
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
    }, [onInfo, onLastClick, onMarkersCount, seedZones, seedHeatPoints]);

    // Layer visibility effects
    useEffect(() => {
        zonesLayerRef.current.setVisible(showZones);
    }, [showZones]);

    useEffect(() => {
        markersLayerRef.current.setVisible(showMarkers);
    }, [showMarkers]);

    useEffect(() => {
        heatLayerRef.current.setVisible(showHeatIncidents);
    }, [showHeatIncidents]);

    // Clear markers effect
    useEffect(() => {
        if (requestClearMarkers == null) return;
        markersSourceRef.current.clear();
        markersCountRef.current = 0;
        onMarkersCount?.(0);
        popupOverlayRef.current?.setPosition(undefined);
    }, [requestClearMarkers, onMarkersCount]);

    // Go to request effect
    useEffect(() => {
        if (!goToRequest || !mapRef.current) return;

        const { lat, lon, zoom = 15, dropMarker, mgrs: mgrsText } = goToRequest;
        const view = mapRef.current.getView();
        const coord = fromLonLat([lon, lat]);

        view.animate({ center: coord, zoom, duration: ANIMATION_DURATION });

        if (dropMarker && markersLayerRef.current.getVisible()) {
            const marker = new Feature({ geometry: new Point(coord) });
            marker.setProperties({
                type: "marker",
                name: "Marker",
                lonLat: [lon, lat],
                mgrs: mgrsText ?? null,
            });
            marker.setStyle(markerStyle());

            markersSourceRef.current.addFeature(marker);
            markersCountRef.current += 1;
            onMarkersCount?.(markersCountRef.current);
        }
    }, [goToRequest, onMarkersCount]);

    return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}
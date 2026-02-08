import React, { useEffect, useMemo, useRef, useState } from "react";

import Map from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import VectorLayer from "ol/layer/Vector.js";

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

// Change later for offline tiles:
// http://localhost:8080/tiles/{z}/{x}/{y}.png
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

type MarkerKind = "default" | "risk";
type MarkerItem = {
    id: string;
    lonLat: [number, number]; // [lon, lat]
    kind: MarkerKind;
};

type Info = {
    zoom: number;
    center: [number, number]; // [lat, lon] for display
};

function svgDataUri(svg: string) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

const pinSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
  <path fill="#ff3b30" d="M12 2c-3.314 0-6 2.686-6 6c0 4.5 6 14 6 14s6-9.5 6-14c0-3.314-2.686-6-6-6z"/>
  <circle cx="12" cy="8" r="2.3" fill="#ffffff"/>
</svg>
`;

const riskSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
  <path fill="#ff9500" d="M12 2c-3.314 0-6 2.686-6 6c0 4.5 6 14 6 14s6-9.5 6-14c0-3.314-2.686-6-6-6z"/>
  <path fill="#111" d="M11 6h2v6h-2z"/>
  <path fill="#111" d="M11 13h2v2h-2z"/>
</svg>
`;

function iconStyle(kind: MarkerKind) {
    return new Style({
        image: new Icon({
            src: kind === "risk" ? svgDataUri(riskSvg) : svgDataUri(pinSvg),
            anchor: [0.5, 1],
            scale: 1,
        }),
    });
}

// Simple risk -> fill/stroke color
function riskFill(score: number) {
    if (score >= 80) return "rgba(255, 59, 48, 0.35)";
    if (score >= 60) return "rgba(255, 149, 0, 0.35)";
    if (score >= 40) return "rgba(255, 204, 0, 0.30)";
    return "rgba(52, 199, 89, 0.28)";
}

function riskStroke(score: number) {
    if (score >= 80) return "rgba(255, 59, 48, 0.85)";
    if (score >= 60) return "rgba(255, 149, 0, 0.85)";
    if (score >= 40) return "rgba(255, 204, 0, 0.85)";
    return "rgba(52, 199, 89, 0.85)";
}

function polygonRiskStyle(name: string, score: number) {
    return new Style({
        stroke: new Stroke({ width: 2, color: riskStroke(score) }),
        fill: new Fill({ color: riskFill(score) }),
        text: new Text({
            text: `${name}\nRisk ${score}`,
            font: "bold 12px system-ui, sans-serif",
            fill: new Fill({ color: "rgba(0,0,0,0.9)" }),
            stroke: new Stroke({ color: "rgba(255,255,255,0.95)", width: 3 }),
            offsetY: -6,
        }),
    });
}

export default function OpenLayersTest() {
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Map | null>(null);
    const viewRef = useRef<View | null>(null);

    const vectorSourceRef = useRef(new VectorSource());
    const vectorLayerRef = useRef(
        new VectorLayer({
            source: vectorSourceRef.current,
        })
    );

    const [markerMode, setMarkerMode] = useState(true);
    const [markerKind, setMarkerKind] = useState<MarkerKind>("default");
    const [markers, setMarkers] = useState<MarkerItem[]>([]);
    const [lastClick, setLastClick] = useState<[number, number] | null>(null); // [lon, lat]
    const [info, setInfo] = useState<Info>({ zoom: 12, center: [33.75, -84.39] });

    // MarkerItem -> Feature (so we can clear)
    const featureByIdRef = useRef<Map<string, Feature<Point>>>(new Map());

    // Popup overlay DOM + overlay refs
    const popupElRef = useRef<HTMLDivElement | null>(null);
    const popupOverlayRef = useRef<Overlay | null>(null);

    const centerLonLat: [number, number] = useMemo(() => [-84.39, 33.75], []);

    // Latest marker mode/kind refs for OL handler
    const markerModeRef = useRef(markerMode);
    const markerKindRef = useRef(markerKind);
    useEffect(() => {
        markerModeRef.current = markerMode;
    }, [markerMode]);
    useEffect(() => {
        markerKindRef.current = markerKind;
    }, [markerKind]);

    useEffect(() => {
        if (!mapDivRef.current) return;

        // --- Base layer
        const raster = new TileLayer({
            source: new XYZ({ url: TILE_URL, maxZoom: 19 }),
        });

        // --- View
        const view = new View({
            center: fromLonLat(centerLonLat),
            zoom: 12,
        });

        // --- Map
        const map = new Map({
            target: mapDivRef.current,
            layers: [raster, vectorLayerRef.current],
            view,
        });

        // --- Popup overlay (create once)
        const popupEl = document.createElement("div");
        popupEl.style.background = "rgba(30,30,30,0.95)";
        popupEl.style.color = "#fff";
        popupEl.style.border = "1px solid rgba(255,255,255,0.12)";
        popupEl.style.borderRadius = "10px";
        popupEl.style.padding = "10px 12px";
        popupEl.style.fontFamily = "system-ui, sans-serif";
        popupEl.style.fontSize = "13px";
        popupEl.style.minWidth = "220px";
        popupEl.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
        popupEl.style.pointerEvents = "auto";

        const popup = new Overlay({
            element: popupEl,
            positioning: "bottom-center",
            stopEvent: true,
            offset: [0, -14],
        });

        map.addOverlay(popup);
        popupElRef.current = popupEl;
        popupOverlayRef.current = popup;

        // --- HUD updates
        const updateInfo = () => {
            const z = view.getZoom() ?? 0;
            const cLonLat = toLonLat(view.getCenter() ?? fromLonLat(centerLonLat)) as [number, number];
            setInfo({ zoom: z, center: [cLonLat[1], cLonLat[0]] });
        };
        map.on("moveend", updateInfo);
        updateInfo();

        // --- Example risk polygon
        const zoneA = new Feature(
            new Polygon([
                [
                    fromLonLat([-84.42, 33.74]),
                    fromLonLat([-84.36, 33.74]),
                    fromLonLat([-84.36, 33.77]),
                    fromLonLat([-84.42, 33.77]),
                    fromLonLat([-84.42, 33.74]),
                ],
            ])
        );
        zoneA.setProperties({
            type: "zone",
            name: "Zone A",
            riskScore: 82,
            reason: "High exposure + missing controls",
            owner: "Team Alpha",
        });
        zoneA.setStyle(polygonRiskStyle("Zone A", 82));
        vectorSourceRef.current.addFeature(zoneA);

        // --- Single click handler (bind here so it always attaches)
        const clickHandler = (evt: any) => {
            const lonLat = toLonLat(evt.coordinate) as [number, number];
            setLastClick(lonLat);

            // 1) Popup if feature clicked
            const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f) as Feature | undefined;
            const popupElNow = popupElRef.current;
            const popupNow = popupOverlayRef.current;

            if (feature && popupElNow && popupNow) {
                const props = feature.getProperties() as any;
                const name = props?.name ?? "Feature";
                const type = props?.type ?? "unknown";
                const riskScore = props?.riskScore;
                const reason = props?.reason;
                const owner = props?.owner;

                popupElNow.innerHTML = `
          <div style="font-weight:800; margin-bottom:6px;">${name}</div>
          <div style="opacity:.9; margin-bottom:6px;">Type: <b>${type}</b></div>
          ${typeof riskScore === "number"
                        ? `<div style="margin-bottom:6px;">Risk Score: <b>${riskScore}</b></div>`
                        : ""
                    }
          ${reason ? `<div style="margin-bottom:6px;">Reason: ${reason}</div>` : ""}
          ${owner ? `<div style="opacity:.85;">Owner: ${owner}</div>` : ""}
        `;
                popupNow.setPosition(evt.coordinate);
            } else {
                popupOverlayRef.current?.setPosition(undefined);
            }

            // 2) Marker dropping (if enabled)
            if (!markerModeRef.current) return;

            const id = crypto.randomUUID();

            const marker = new Feature({
                geometry: new Point(fromLonLat(lonLat)),
            });

            marker.setProperties({
                type: "marker",
                id,
                kind: markerKindRef.current,
                name: markerKindRef.current === "risk" ? "Risk Marker" : "Marker",
            });

            marker.setStyle(iconStyle(markerKindRef.current));

            featureByIdRef.current.set(id, marker as Feature<Point>);
            vectorSourceRef.current.addFeature(marker);

            setMarkers((prev) => [...prev, { id, lonLat, kind: markerKindRef.current }]);
        };

        map.on("singleclick", clickHandler);

        // Save refs for cleanup
        mapRef.current = map;
        viewRef.current = view;

        return () => {
            map.un("singleclick", clickHandler);
            map.un("moveend", updateInfo);
            map.setTarget(undefined);

            mapRef.current = null;
            viewRef.current = null;
            popupElRef.current = null;
            popupOverlayRef.current = null;
        };
    }, [centerLonLat]);

    const clearMarkers = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();

        // Remove all marker features (but keep polygons/zones)
        const src = vectorSourceRef.current;
        const toRemove = src
            .getFeatures()
            .filter((f) => f.get("type") === "marker");

        toRemove.forEach((f) => src.removeFeature(f));

        // Reset local state + refs
        featureByIdRef.current.clear();
        setMarkers([]);
        popupOverlayRef.current?.setPosition(undefined);
    };


    return (
        <div style={{ height: "100%", width: "100%", position: "relative" }}>
            {/* HUD */}
            <div
                style={{
                    position: "absolute",
                    zIndex: 1000,
                    top: 12,
                    left: 28,
                    background: "rgba(30, 30, 30, 0.95)",
                    color: "#f1f1f1",
                    padding: 12,
                    borderRadius: 10,
                    width: 360,
                    fontFamily: "system-ui, sans-serif",
                    fontSize: 13,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>OpenLayers Marker Tool</div>

                <div style={{ opacity: 0.9 }}>
                    Zoom: <code style={{ color: "#fff" }}>{info.zoom.toFixed(2)}</code>
                    <br />
                    Center:{" "}
                    <code style={{ color: "#fff" }}>
                        {info.center[0].toFixed(5)}, {info.center[1].toFixed(5)}
                    </code>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#ddd", marginTop: 10 }}>
                    <input type="checkbox" checked={markerMode} onChange={(e) => setMarkerMode(e.target.checked)} />
                    Click-to-drop markers
                </label>

                <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ opacity: 0.9 }}>Marker type:</span>
                    <select
                        value={markerKind}
                        onChange={(e) => setMarkerKind(e.target.value as MarkerKind)}
                        style={{
                            background: "#222",
                            color: "#fff",
                            border: "1px solid #555",
                            borderRadius: 8,
                            padding: "6px 8px",
                        }}
                    >
                        <option value="default">Default Pin</option>
                        <option value="risk">Risk Pin</option>
                    </select>
                </div>

                <div style={{ marginTop: 10 }}>
                    Markers: <b>{markers.length}</b>
                    <button
                        style={{
                            marginLeft: 10,
                            background: "#444",
                            color: "#fff",
                            border: "1px solid #666",
                            borderRadius: 8,
                            padding: "6px 10px",
                            cursor: markers.length ? "pointer" : "not-allowed",
                            opacity: markers.length ? 1 : 0.6,
                        }}
                        onClick={clearMarkers}
                        disabled={markers.length === 0}
                    >
                        Clear
                    </button>
                </div>

                <div style={{ marginTop: 10, opacity: 0.9 }}>
                    Last click:{" "}
                    <code style={{ color: "#fff" }}>
                        {lastClick ? `${lastClick[1].toFixed(5)}, ${lastClick[0].toFixed(5)}` : "—"}
                    </code>
                </div>

                <div style={{ marginTop: 10, opacity: 0.75 }}>
                    Tile URL: <code style={{ color: "#fff" }}>{TILE_URL}</code>
                </div>

                <div style={{ marginTop: 10, opacity: 0.75 }}>Tip: Click the polygon to see the popup.</div>
            </div>

            <div ref={mapDivRef} style={{ height: "100%", width: "100%" }} />
        </div>
    );
}

import React, { useState, useCallback } from "react";
import * as mgrs from "mgrs";

import OpenLayersTest from "./OpenLayersTest";
import type { OLInfo, GoToRequest, MapEvent } from "./types";
import { MapDataProvider, useMapData } from "./MapDataContext";

/* ============================================================
   Local types
   ============================================================ */

/**
 * Simple UI toggles for turning map layers on/off.
 * (Kept local because nothing else needs it.)
 */
type Toggles = {
    zones: boolean;
    markers: boolean;
    heatIncidents: boolean;
};

/* ============================================================
   Styles
   ============================================================
   I'm leaving these as inline style objects on purpose:
   - this file is basically a small demo shell
   - avoids introducing a CSS file just for a toolbar/drawer
   - easy to tweak quickly while iterating
*/

const BAR_STYLE: React.CSSProperties = {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    zIndex: 3000,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    background: "rgba(245,245,245,0.98)",
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 8,
    boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};

const INPUT_STYLE: React.CSSProperties = {
    height: 28,
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.25)",
    padding: "0 10px",
    outline: "none",
    fontSize: 13,
    background: "#fff",
};

const ICON_BTN_STYLE: React.CSSProperties = {
    width: 34,
    height: 30,
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.25)",
    background: "#fff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    userSelect: "none",
};

const SUBMIT_STYLE: React.CSSProperties = {
    height: 30,
    padding: "0 12px",
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.25)",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    whiteSpace: "nowrap",
};

const DRAWER_WIDTH = 300;

const ROW_STYLE: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
};

const DIVIDER_STYLE: React.CSSProperties = {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid rgba(255,255,255,0.12)",
};

/* ============================================================
   Little helpers
   ============================================================ */

/**
 * Consistent numeric formatting for lat/lon values displayed in the UI.
 */
function formatNumber(n: number): string {
    return n.toFixed(5);
}

/**
 * Parses the "go to" input box.
 * Accepts either:
 *  - MGRS string (contains letters)
 *  - "lat, lon" numeric string
 */
function parseCoordinateInput(input: string): { lat: number; lon: number; mgrsText?: string } {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("Empty input");

    // Quick heuristic: MGRS usually has letters (e.g. "16SEG...")
    if (/[a-zA-Z]/.test(trimmed)) {
        const [lon, lat] = mgrs.toPoint(trimmed) as [number, number];
        return { lat, lon, mgrsText: trimmed };
    }

    // Otherwise assume "lat lon" or "lat, lon"
    const parts = trimmed
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean);

    if (parts.length < 2) throw new Error("Need two numbers");

    const lat = Number(parts[0]);
    const lon = Number(parts[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error("Invalid numbers");
    }

    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw new Error("Coordinates out of range");
    }

    return { lat, lon };
}

/**
 * Drawer animation style (simple slide-in/out).
 * I kept this as a function because it depends on `isOpen`.
 */
function getDrawerStyle(isOpen: boolean): React.CSSProperties {
    return {
        position: "absolute",
        top: 70,
        left: 0,
        zIndex: 2500,
        width: DRAWER_WIDTH,
        maxHeight: "calc(100vh - 80px)",
        overflow: "auto",
        background: "rgba(30,30,30,0.95)",
        color: "#f1f1f1",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        padding: 12,

        // slide animation
        transform: isOpen ? "translateX(0)" : `translateX(-${DRAWER_WIDTH + 24}px)`,
        transition: "transform 180ms ease",

        // prevents accidental text selection when dragging around
        userSelect: "none",
    };
}

/* ============================================================
   Main Map Component (reads/writes from context)
   ============================================================ */

function MapView() {
    // UI inputs
    const [coordText, setCoordText] = useState("");
    const [query, setQuery] = useState("");
    const [drawerOpen, setDrawerOpen] = useState(true);

    // Layer toggles
    const [toggles, setToggles] = useState<Toggles>({
        zones: true,
        markers: true,
        heatIncidents: true,
    });

    // Map state coming back from OpenLayersTest
    const [info, setInfo] = useState<OLInfo>({
        zoom: 12,
        centerLatLon: [33.75, -84.39],
    });

    const [lastClick, setLastClick] = useState<[number, number] | null>(null);

    // Marker bookkeeping
    const [markersCount, setMarkersCount] = useState(0);

    /**
     * We use a token to trigger "clear all markers"
     * without passing functions down into OpenLayersTest.
     *
     * It's basically: every time token changes, OpenLayersTest clears.
     */
    const [clearToken, setClearToken] = useState(0);

    // goToRequest acts like a “command” to OpenLayersTest (fly to + maybe drop marker)
    const [goToRequest, setGoToRequest] = useState<GoToRequest | null>(null);

    // Event log is just for demo/visibility
    const [eventLog, setEventLog] = useState<string[]>([]);

    // Central store
    const { markers, getMarker } = useMapData();

    /* ---------------- UI handlers ---------------- */

    /**
     * Top bar submit:
     * - parse text (MGRS or lat/lon)
     * - create a goToRequest
     * - OpenLayersTest picks it up and animates the view
     */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const { lat, lon, mgrsText } = parseCoordinateInput(coordText);

            // If user typed lat/lon, we compute MGRS ourselves for the store
            const computedMgrs = mgrsText ?? (mgrs.forward([lon, lat], 5) as string);

            setGoToRequest({
                lat,
                lon,
                zoom: 15,
                dropMarker: true,
                mgrs: computedMgrs,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid input";
            alert(`${message}\n\nExpected format:\n• Lat, Lon: 33.75, -84.39\n• MGRS: 16SEG1234567890`);
        }
    };

    const handleToggle =
        (key: keyof Toggles) => (e: React.ChangeEvent<HTMLInputElement>) => {
            setToggles((prev) => ({ ...prev, [key]: e.target.checked }));
        };

    /**
     * Central event handler coming from OpenLayersTest.
     *
     * NOTE: markerAdded is slightly special:
     * we get the markerId, but the store update might not be committed
     * at the exact moment this callback runs.
     *
     * So we do a tiny timeout and then read from the store. 
     * but it works fine for UI/demo. (If this grows, we'd want a more robust approach.)
     */
    const handleMapEvent = useCallback(
        (event: MapEvent) => {
            const timestamp = new Date().toLocaleTimeString();
            let logMessage = "";

            switch (event.type) {
                case "markerAdded": {
                    // Wait a beat for state update, then pull details from store.
                    setTimeout(() => {
                        const marker = getMarker(event.markerId);
                        if (!marker) return;

                        const msg = `[${timestamp}] Marker added at ${marker.lat.toFixed(
                            4
                        )}, ${marker.lon.toFixed(4)} (${marker.mgrs})`;

                        setEventLog((prev) => [msg, ...prev].slice(0, 10));
                    }, 50);

                    return; // handled async
                }

                case "markerRemoved": {
                    logMessage = `[${timestamp}] Marker removed at ${event.coordinates[0].toFixed(
                        4
                    )}, ${event.coordinates[1].toFixed(4)}`;
                    break;
                }

                case "zoneClicked": {
                    logMessage = `[${timestamp}] Zone clicked: ${event.zoneId}`;
                    break;
                }

                case "featureClicked": {
                    logMessage = `[${timestamp}] ${event.featureType} clicked (${event.featureId})`;
                    break;
                }
            }

            if (logMessage) {
                setEventLog((prev) => [logMessage, ...prev].slice(0, 10));
            }
        },
        [getMarker]
    );

    /* ============================================================
       Render
       ============================================================ */

    return (
        <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
            {/* Top Bar */}
            <form
                style={BAR_STYLE}
                onSubmit={handleSubmit}
                onMouseDown={(e) => e.stopPropagation()} // prevents map drag from stealing the event
            >
                <button
                    type="button"
                    style={ICON_BTN_STYLE}
                    onClick={() => setDrawerOpen((v) => !v)}
                    title="Toggle menu"
                    aria-label="Toggle menu"
                >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>☰</span>
                </button>

                <input
                    value={coordText}
                    onChange={(e) => setCoordText(e.target.value)}
                    placeholder="Enter MGRS or Lat/Lon (e.g., 33.75, -84.39 or 16SEG...)"
                    style={{ ...INPUT_STYLE, flex: "0 0 420px" }}
                    aria-label="Coordinate input"
                />

                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask about risk, traffic, nearby ports..."
                    style={{ ...INPUT_STYLE, flex: "1 1 auto", minWidth: 200 }}
                    aria-label="Query input"
                />

                <button type="submit" style={SUBMIT_STYLE}>
                    Submit
                </button>

                {/* "Chat" button is just a placeholder right now */}
                <button
                    type="button"
                    style={ICON_BTN_STYLE}
                    onClick={() => console.log("Chat clicked with query:", query)}
                    title="Chat"
                    aria-label="Open chat"
                >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>💬</span>
                </button>
            </form>

            {/* Side Drawer */}
            <div
                style={getDrawerStyle(drawerOpen)}
                onMouseDown={(e) => e.stopPropagation()} // prevents map from reacting
            >
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>
                    Controls
                </div>

                <div style={{ opacity: 0.92, lineHeight: 1.5 }}>
                    <div>
                        Zoom:{" "}
                        <code style={{ color: "#fff" }}>{info.zoom.toFixed(2)}</code>
                    </div>
                    <div>
                        Center:{" "}
                        <code style={{ color: "#fff" }}>
                            {formatNumber(info.centerLatLon[0])},{" "}
                            {formatNumber(info.centerLatLon[1])}
                        </code>
                    </div>
                </div>

                <button
                    type="button"
                    disabled={markersCount === 0}
                    onClick={() => setClearToken((t) => t + 1)}
                    style={{
                        marginTop: 10,
                        width: "100%",
                        background: "#e9e9e9",
                        color: "#111",
                        border: "1px solid rgba(0,0,0,0.20)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontWeight: 700,
                        cursor: markersCount ? "pointer" : "not-allowed",
                        opacity: markersCount ? 1 : 0.7,
                    }}
                    aria-label="Clear all markers"
                >
                    Clear markers ({markersCount})
                </button>

                <div style={DIVIDER_STYLE}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Overlays</div>

                    <label style={ROW_STYLE}>
                        <input
                            type="checkbox"
                            checked={toggles.zones}
                            onChange={handleToggle("zones")}
                            aria-label="Toggle zones"
                        />
                        Zones
                    </label>

                    <label style={ROW_STYLE}>
                        <input
                            type="checkbox"
                            checked={toggles.markers}
                            onChange={handleToggle("markers")}
                            aria-label="Toggle markers"
                        />
                        Markers
                    </label>

                    <label style={ROW_STYLE}>
                        <input
                            type="checkbox"
                            checked={toggles.heatIncidents}
                            onChange={handleToggle("heatIncidents")}
                            aria-label="Toggle heatmap"
                        />
                        Heatmap: Incidents
                    </label>
                </div>

                <div style={{ marginTop: 12, opacity: 0.9 }}>
                    Markers: <b>{markersCount}</b>
                </div>

                <div style={{ marginTop: 10, opacity: 0.9 }}>
                    Last click:{" "}
                    <code style={{ color: "#fff" }}>
                        {lastClick
                            ? `${formatNumber(lastClick[0])}, ${formatNumber(lastClick[1])}`
                            : "—"}
                    </code>
                </div>

                {/* Event Log */}
                <div style={DIVIDER_STYLE}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Event Log</div>

                    <div style={{ fontSize: 11, opacity: 0.8, maxHeight: 150, overflow: "auto" }}>
                        {eventLog.length === 0 && <div>No events yet...</div>}

                        {eventLog.map((log, i) => (
                            <div key={i} style={{ marginBottom: 4 }}>
                                {log}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Marker List (read from centralized store) */}
                <div style={DIVIDER_STYLE}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>All Markers</div>

                    <div style={{ fontSize: 11, opacity: 0.8, maxHeight: 100, overflow: "auto" }}>
                        {markers.size === 0 && <div>No markers yet...</div>}

                        {Array.from(markers.values()).map((marker) => (
                            <div key={marker.id} style={{ marginBottom: 4 }}>
                                {marker.mgrs} @ {marker.lat.toFixed(3)}, {marker.lon.toFixed(3)}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Map itself */}
            <OpenLayersTest
                showZones={toggles.zones}
                showMarkers={toggles.markers}
                showHeatIncidents={toggles.heatIncidents}
                requestClearMarkers={clearToken}
                goToRequest={goToRequest}
                onInfo={setInfo}
                onLastClick={setLastClick}
                onMarkersCount={setMarkersCount}
                onMapEvent={handleMapEvent}
            />
        </div>
    );
}

/* ============================================================
   Root App
   ============================================================ */

/**
 * App root wraps everything in MapDataProvider.
 * That keeps marker data accessible from both the map + the UI.
 */
export default function App() {
    return (
        <MapDataProvider>
            <MapView />
        </MapDataProvider>
    );
}

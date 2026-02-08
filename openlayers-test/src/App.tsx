import React, { useMemo, useState } from "react";
import * as mgrs from "mgrs";
import OpenLayersTest from "./OpenLayersTest";
import type { OLInfo, GoToRequest } from "./OpenLayersTest";

type Toggles = {
    zones: boolean;
    markers: boolean;
    heatIncidents: boolean;
};

// Utility Functions
function formatNumber(n: number): string {
    return n.toFixed(5);
}

/**
 * Parses coordinate input in various formats:
 * - "33.75, -84.39" (lat, lon)
 * - "-84.39, 33.75" (lon, lat) - auto-detected if first value looks like longitude
 * - "16SEG1234567890" (MGRS)
 */
function parseCoordinateInput(input: string): { lat: number; lon: number; mgrsText?: string } {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("Empty input");

    // Check for MGRS format (contains letters)
    if (/[a-zA-Z]/.test(trimmed)) {
        const [lon, lat] = mgrs.toPoint(trimmed) as [number, number];
        return { lat, lon, mgrsText: trimmed };
    }

    // Parse numeric coordinates
    const parts = trimmed
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean);

    if (parts.length < 2) throw new Error("Need two numbers");

    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Invalid numbers");

    // if first value looks like longitude (abs > 90), treat as lon,lat
    let lat: number;
    let lon: number;

    if (Math.abs(a) > 90 && Math.abs(a) <= 180 && Math.abs(b) <= 90) {
        lon = a;
        lat = b;
    } else {
        lat = a;
        lon = b;
    }

    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw new Error("Coordinates out of range");
    }

    return { lat, lon };
}

// Component Styles
const useStyles = () => {
    const barStyle = useMemo<React.CSSProperties>(
        () => ({
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
        }),
        []
    );

    const inputStyle = useMemo<React.CSSProperties>(
        () => ({
            height: 28,
            borderRadius: 6,
            border: "1px solid rgba(0,0,0,0.25)",
            padding: "0 10px",
            outline: "none",
            fontSize: 13,
            background: "#fff",
        }),
        []
    );

    const iconBtnStyle = useMemo<React.CSSProperties>(
        () => ({
            width: 34,
            height: 30,
            borderRadius: 6,
            border: "1px solid rgba(0,0,0,0.25)",
            background: "#fff",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            userSelect: "none",
        }),
        []
    );

    const submitStyle = useMemo<React.CSSProperties>(
        () => ({
            height: 30,
            padding: "0 12px",
            borderRadius: 6,
            border: "1px solid rgba(0,0,0,0.25)",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
            whiteSpace: "nowrap",
        }),
        []
    );

    return { barStyle, inputStyle, iconBtnStyle, submitStyle };
};

const useDrawerStyle = (drawerOpen: boolean) => {
    const drawerWidth = 300;

    return useMemo<React.CSSProperties>(
        () => ({
            position: "absolute",
            top: 70,
            left: 0,
            zIndex: 2500,
            width: drawerWidth,
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
            transform: drawerOpen ? "translateX(0)" : `translateX(-${drawerWidth + 24}px)`,
            transition: "transform 180ms ease",
            userSelect: "none",
        }),
        [drawerOpen]
    );
};

// Main Component
export default function App() {
    const [coordText, setCoordText] = useState("");
    const [query, setQuery] = useState("");
    const [drawerOpen, setDrawerOpen] = useState(true);

    const [toggles, setToggles] = useState<Toggles>({
        zones: true,
        markers: true,
        heatIncidents: true,
    });

    const [info, setInfo] = useState<OLInfo>({ zoom: 12, centerLatLon: [33.75, -84.39] });
    const [lastClick, setLastClick] = useState<[number, number] | null>(null);
    const [markersCount, setMarkersCount] = useState(0);
    const [clearToken, setClearToken] = useState(0);

    const [goToRequest, setGoToRequest] = useState<GoToRequest | null>(null);
    const [goToToken, setGoToToken] = useState(0);

    const { barStyle, inputStyle, iconBtnStyle, submitStyle } = useStyles();
    const drawerStyle = useDrawerStyle(drawerOpen);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const { lat, lon, mgrsText } = parseCoordinateInput(coordText);

            // Compute MGRS if user provided lat/lon
            const computedMgrs = mgrsText ?? (mgrs.forward([lon, lat], 5) as string);

            setGoToToken((t) => {
                const next = t + 1;
                setGoToRequest({
                    lat,
                    lon,
                    zoom: 15,
                    dropMarker: true,
                    mgrs: computedMgrs,
                    seq: next,
                });
                return next;
            });
        } catch {
            alert("Enter a valid MGRS or Lat/Lon. Examples:\n33.75, -84.39\n-84.39, 33.75\n16SEG1234567890");
        }
    };

    const handleToggle = (key: keyof Toggles) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setToggles((prev) => ({ ...prev, [key]: e.target.checked }));
    };

    const rowStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 8,
    };

    const dividerStyle: React.CSSProperties = {
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid rgba(255,255,255,0.12)",
    };

    return (
        <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
            {/* Top Bar */}
            <form style={barStyle} onSubmit={handleSubmit} onMouseDown={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    style={iconBtnStyle}
                    onClick={() => setDrawerOpen((v) => !v)}
                    title="Menu"
                >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>☰</span>
                </button>

                <input
                    value={coordText}
                    onChange={(e) => setCoordText(e.target.value)}
                    placeholder="Enter MGRS or Lat/Lon (e.g., 33.75, -84.39 or 16SEG...)"
                    style={{ ...inputStyle, flex: "0 0 420px" }}
                />

                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask about risk, traffic, nearby ports..."
                    style={{ ...inputStyle, flex: "1 1 auto", minWidth: 200 }}
                />

                <button type="submit" style={submitStyle}>
                    Submit
                </button>

                <button
                    type="button"
                    style={iconBtnStyle}
                    onClick={() => console.log("chat")}
                    title="Chat"
                >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>💬</span>
                </button>
            </form>

            {/* Side Drawer */}
            <div style={drawerStyle} onMouseDown={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Controls</div>

                <div style={{ opacity: 0.92, lineHeight: 1.5 }}>
                    <div>
                        Zoom: <code style={{ color: "#fff" }}>{info.zoom.toFixed(2)}</code>
                    </div>
                    <div>
                        Center:{" "}
                        <code style={{ color: "#fff" }}>
                            {formatNumber(info.centerLatLon[0])}, {formatNumber(info.centerLatLon[1])}
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
                >
                    Clear markers
                </button>

                <div style={dividerStyle}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Overlays</div>

                    <label style={rowStyle}>
                        <input type="checkbox" checked={toggles.zones} onChange={handleToggle("zones")} />
                        Zones
                    </label>

                    <label style={rowStyle}>
                        <input type="checkbox" checked={toggles.markers} onChange={handleToggle("markers")} />
                        Markers
                    </label>

                    <label style={rowStyle}>
                        <input
                            type="checkbox"
                            checked={toggles.heatIncidents}
                            onChange={handleToggle("heatIncidents")}
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
                        {lastClick ? `${formatNumber(lastClick[0])}, ${formatNumber(lastClick[1])}` : "—"}
                    </code>
                </div>
            </div>

            {/* Map */}
            <OpenLayersTest
                showZones={toggles.zones}
                showMarkers={toggles.markers}
                showHeatIncidents={toggles.heatIncidents}
                requestClearMarkersToken={clearToken}
                goToRequest={goToRequest}
                onInfo={setInfo}
                onLastClick={setLastClick}
                onMarkersCount={setMarkersCount}
            />
        </div>
    );
}
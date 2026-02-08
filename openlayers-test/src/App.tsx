
import React, { useState } from "react";
import * as mgrs from "mgrs";
import OpenLayersTest from "./OpenLayersTest";
import type { OLInfo, GoToRequest } from "./OpenLayersTest";

type ToggleOptions = {
    zones: boolean;
    markers: boolean;
    heatIncidents: boolean;
};

// todo: move this out to a constants/styles file later maybe?
const bar = {
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

const drawerWidth = 300;

const inputBox = {
    height: 28,
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.25)",
    padding: "0 10px",
    fontSize: 13,
    background: "#fff",
    outline: "none",
};

const tinyBtn = {
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

const btnSubmit = {
    height: 30,
    padding: "0 12px",
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.25)",
    background: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
};

const getDrawerStyle = (visible: boolean): React.CSSProperties => {
    return {
        position: "absolute",
        top: 70,
        left: 0,
        width: drawerWidth,
        maxHeight: "calc(100vh - 80px)",
        overflow: "auto",
        zIndex: 2500,
        background: "rgba(30,30,30,0.95)",
        color: "#f1f1f1",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
        padding: 12,
        transform: visible ? "translateX(0)" : `translateX(-${drawerWidth + 24}px)`,
        transition: "transform 180ms ease",
        userSelect: "none",
        fontSize: 13,
    };
};

const prettyFloat = (val: number) => val.toFixed(5);


function parseCoords(val: string) {
    const txt = val.trim();
    if (!txt) throw new Error("You didn't enter anything.");

    if (/[a-z]/i.test(txt)) {
        const [lon, lat] = mgrs.toPoint(txt) as [number, number]; // MGRS has lon/lat reversed
        return { lat, lon, mgrsText: txt };
    }

    const bits = txt.split(/[,\s]+/).filter(Boolean);
    if (bits.length < 2) throw new Error("Need both lat & lon");

    const lat = parseFloat(bits[0]);
    const lon = parseFloat(bits[1]);

    if (!isFinite(lat) || !isFinite(lon)) throw new Error("That's not a number?");
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("Out of bounds");

    return { lat, lon };
}

export default function App() {
    const [coordInput, setCoordInput] = useState(""); // text box for user coords
    const [question, setQuestion] = useState(""); // extra search input
    const [drawerIsOpen, toggleDrawer] = useState(true); // left-side menu

    // TODO: consider storing in context or redux if needed globally
    const [layerOptions, setLayerOptions] = useState<ToggleOptions>({
        zones: true,
        markers: true,
        heatIncidents: true,
    });

    const [mapInfo, setMapInfo] = useState<OLInfo>({ zoom: 12, centerLatLon: [33.75, -84.39] });
    const [clickedCoords, setClickedCoords] = useState<[number, number] | null>(null);
    const [markerCount, setMarkerCount] = useState(0);
    const [clearCounter, bumpClearCounter] = useState(0);
    const [moveTo, setMoveTo] = useState<GoToRequest | null>(null);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const parsed = parseCoords(coordInput);
            const mgrsResult = parsed.mgrsText || mgrs.forward([parsed.lon, parsed.lat], 5);

            setMoveTo({
                lat: parsed.lat,
                lon: parsed.lon,
                mgrs: mgrsResult,
                zoom: 15,
                dropMarker: true,
            });
        } catch (err: any) {
            alert(`${err.message}\n\nExamples:\n→ 33.75, -84.39\n→ 16SEG1234567890`);
        }
    };

    const toggleLayer = (name: keyof ToggleOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setLayerOptions((prev) => ({
            ...prev,
            [name]: e.target.checked,
        }));
    };

    return (
        <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
            <form style={bar} onSubmit={onSubmit}>
                <button type="button" style={tinyBtn} onClick={() => toggleDrawer(!drawerIsOpen)}>
                    <span style={{ fontSize: 18 }}>☰</span>
                </button>

                <input
                    value={coordInput}
                    onChange={(e) => setCoordInput(e.target.value)}
                    placeholder="MGRS or lat/lon e.g. 33.75, -84.39"
                    style={{ ...inputBox, flex: "0 0 420px" }}
                />

                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about this place..."
                    style={{ ...inputBox, flex: "1 1 auto", minWidth: 180 }}
                />

                <button type="submit" style={btnSubmit}>Go</button>

                <button type="button" style={tinyBtn} onClick={() => console.log("Chat:", question)}>
                    💬
                </button>
            </form>

            {/* Side panel for toggles & stuff */}
            <div style={getDrawerStyle(drawerIsOpen)}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Controls</div>

                <div style={{ marginBottom: 12 }}>
                    Zoom: <code>{mapInfo.zoom.toFixed(2)}</code>
                    <br />
                    Center:{" "}
                    <code>
                        {prettyFloat(mapInfo.centerLatLon[0])}, {prettyFloat(mapInfo.centerLatLon[1])}
                    </code>
                </div>

                <button
                    disabled={markerCount === 0}
                    onClick={() => bumpClearCounter((v) => v + 1)}
                    style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        width: "100%",
                        background: "#eaeaea",
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.2)",
                        fontWeight: 600,
                        cursor: markerCount ? "pointer" : "not-allowed",
                        opacity: markerCount ? 1 : 0.6,
                    }}
                >
                    Clear markers ({markerCount})
                </button>

                <hr style={{ marginTop: 16, marginBottom: 12 }} />

                <div style={{ fontWeight: 700, marginBottom: 8 }}>Layers</div>

                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={layerOptions.zones} onChange={toggleLayer("zones")} />
                    Zones
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={layerOptions.markers} onChange={toggleLayer("markers")} />
                    Markers
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={layerOptions.heatIncidents}
                        onChange={toggleLayer("heatIncidents")}
                    />
                    Heatmap
                </label>

                <div style={{ marginTop: 12, opacity: 0.9 }}>
                    Last click:
                    <br />
                    <code>
                        {clickedCoords
                            ? `${prettyFloat(clickedCoords[0])}, ${prettyFloat(clickedCoords[1])}`
                            : "—"}
                    </code>
                </div>
            </div>

            <OpenLayersTest
                showZones={layerOptions.zones}
                showMarkers={layerOptions.markers}
                showHeatIncidents={layerOptions.heatIncidents}
                requestClearMarkers={clearCounter}
                goToRequest={moveTo}
                onInfo={setMapInfo}
                onLastClick={setClickedCoords}
                onMarkersCount={setMarkerCount}
            />
        </div>
    );
}

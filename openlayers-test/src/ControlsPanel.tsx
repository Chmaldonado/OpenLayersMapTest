import React from "react";

type Props = {
    title: string;

    zoomText: string;
    centerText: string;

    markerMode: boolean;
    setMarkerMode: (v: boolean) => void;

    markersCount: number;
    onClearMarkers: (e: React.MouseEvent<HTMLButtonElement>) => void;

    showZones: boolean;
    setShowZones: (v: boolean) => void;

    showMarkers: boolean;
    setShowMarkers: (v: boolean) => void;

    showHeatIncidents: boolean;
    setShowHeatIncidents: (v: boolean) => void;

    lastClickText: string;
};

export default function ControlsPanel(props: Props) {
    const {
        title,
        zoomText,
        centerText,
        markerMode,
        setMarkerMode,
        markersCount,
        onClearMarkers,
        showZones,
        setShowZones,
        showMarkers,
        setShowMarkers,
        showHeatIncidents,
        setShowHeatIncidents,
        lastClickText,
    } = props;

    return (
        <div
            style={{
                position: "absolute",
                zIndex: 1000,
                top: 12,
                left: 28,
                width: 360,
                background: "rgba(30, 30, 30, 0.95)",
                color: "#f1f1f1",
                padding: 12,
                borderRadius: 10,
                fontFamily: "system-ui, sans-serif",
                fontSize: 13,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                userSelect: "none",
            }}
            onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{title}</div>

            <div style={{ opacity: 0.92, lineHeight: 1.45 }}>
                Zoom: <code style={{ color: "#fff" }}>{zoomText}</code>
                <br />
                Center: <code style={{ color: "#fff" }}>{centerText}</code>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <input type="checkbox" checked={markerMode} onChange={(e) => setMarkerMode(e.target.checked)} />
                Drop markers
            </label>

            <button
                onClick={onClearMarkers}
                disabled={markersCount === 0}
                style={{
                    marginTop: 10,
                    background: "#e9e9e9",
                    color: "#111",
                    border: "1px solid #bbb",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: markersCount ? "pointer" : "not-allowed",
                    opacity: markersCount ? 1 : 0.7,
                }}
            >
                Clear markers
            </button>

            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
                    Zones
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
                    Markers
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={showHeatIncidents}
                        onChange={(e) => setShowHeatIncidents(e.target.checked)}
                    />
                    Heatmap: Incidents
                </label>
            </div>

            <div style={{ marginTop: 10, opacity: 0.9 }}>
                Last click: <code style={{ color: "#fff" }}>{lastClickText}</code>
            </div>
        </div>
    );
}

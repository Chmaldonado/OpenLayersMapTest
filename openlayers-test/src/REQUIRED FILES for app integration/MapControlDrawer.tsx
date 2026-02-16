import React, { useState } from "react";
import type { OLInfo, MapEvent } from "./types";
import { useMapData } from "./MapDataContext";

type Toggles = {
  zones: boolean;
  markers: boolean;
  heatIncidents: boolean;
};

type MapControlDrawerProps = {
  isOpen: boolean;
  onToggle: () => void;
  mapInfo: OLInfo;
  lastClick: [number, number] | null;
  markersCount: number;
  onClearMarkers: () => void;
  toggles: Toggles;
  onToggleChange: (key: keyof Toggles, value: boolean) => void;
  eventLog: string[];
  style?: React.CSSProperties;
  className?: string;
};

const DRAWER_WIDTH = 300;

const DIVIDER_STYLE: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid rgba(255,255,255,0.12)",
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 8,
};

function formatNumber(n: number): string {
  return n.toFixed(5);
}

function getDrawerStyle(isOpen: boolean): React.CSSProperties {
  return {
    position: "absolute",
    top: 10,
    left: 0,
    zIndex: 2500,
    width: DRAWER_WIDTH,
    maxHeight: "calc(100vh - 20px)",
    overflow: "auto",
    background: "rgba(30,30,30,0.95)",
    color: "#f1f1f1",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 10,
    boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
    padding: 12,
    transform: isOpen ? "translateX(10px)" : `translateX(-${DRAWER_WIDTH + 20}px)`,
    transition: "transform 180ms ease",
    userSelect: "none",
  };
}

export default function MapControlDrawer(props: MapControlDrawerProps) {
  const {
    isOpen,
    onToggle,
    mapInfo,
    lastClick,
    markersCount,
    onClearMarkers,
    toggles,
    onToggleChange,
    eventLog,
    style,
    className,
  } = props;

  // Access centralized data store
  const { markers } = useMapData();

  return (
    <div style={{ ...getDrawerStyle(isOpen), ...style }} className={className}>
      {/* Header */}
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Controls</div>

      {/* Map Info */}
      <div style={{ opacity: 0.92, lineHeight: 1.5 }}>
        <div>
          Zoom: <code style={{ color: "#fff" }}>{mapInfo.zoom.toFixed(2)}</code>
        </div>
        <div>
          Center:{" "}
          <code style={{ color: "#fff" }}>
            {formatNumber(mapInfo.centerLatLon[0])}, {formatNumber(mapInfo.centerLatLon[1])}
          </code>
        </div>
      </div>

      {/* Clear Markers Button */}
      <button
        type="button"
        disabled={markersCount === 0}
        onClick={onClearMarkers}
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

      {/* Overlays Section */}
      <div style={DIVIDER_STYLE}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Overlays</div>

        <label style={ROW_STYLE}>
          <input
            type="checkbox"
            checked={toggles.zones}
            onChange={(e) => onToggleChange("zones", e.target.checked)}
            aria-label="Toggle zones"
          />
          Zones
        </label>

        <label style={ROW_STYLE}>
          <input
            type="checkbox"
            checked={toggles.markers}
            onChange={(e) => onToggleChange("markers", e.target.checked)}
            aria-label="Toggle markers"
          />
          Markers
        </label>

        <label style={ROW_STYLE}>
          <input
            type="checkbox"
            checked={toggles.heatIncidents}
            onChange={(e) => onToggleChange("heatIncidents", e.target.checked)}
            aria-label="Toggle heatmap"
          />
          Heatmap: Incidents
        </label>
      </div>

      {/* Markers Count */}
      <div style={{ marginTop: 12, opacity: 0.9 }}>
        Markers: <b>{markersCount}</b>
      </div>

      {/* Last Click */}
      <div style={{ marginTop: 10, opacity: 0.9 }}>
        Last click:{" "}
        <code style={{ color: "#fff" }}>
          {lastClick ? `${formatNumber(lastClick[0])}, ${formatNumber(lastClick[1])}` : "—"}
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

      {/* Marker List */}
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
  );
}

// Toggle button component (optional - to show/hide drawer)
export function MapDrawerToggle({ isOpen, onToggle, style }: { isOpen: boolean; onToggle: () => void; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: "absolute",
        top: 10,
        left: isOpen ? DRAWER_WIDTH + 20 : 10,
        zIndex: 3000,
        width: 40,
        height: 40,
        borderRadius: 8,
        border: "1px solid rgba(0,0,0,0.25)",
        background: "rgba(245,245,245,0.98)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        userSelect: "none",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        transition: "left 180ms ease",
        ...style,
      }}
      title={isOpen ? "Close drawer" : "Open drawer"}
      aria-label={isOpen ? "Close drawer" : "Open drawer"}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>☰</span>
    </button>
  );
}

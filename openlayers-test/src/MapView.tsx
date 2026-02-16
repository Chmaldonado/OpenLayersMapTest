import React, { useState, useCallback } from "react";
import * as mgrs from "mgrs";
import OpenLayersTest from "./OpenLayersTest";
import type { OLInfo, GoToRequest, MapEvent } from "./types";
import { useMapData } from "./MapDataContext";

type Toggles = {
  zones: boolean;
  markers: boolean;
  heatIncidents: boolean;
};

type MapViewProps = {
  onMarkerAdded?: (marker: { id: string; lat: number; lon: number; mgrs: string }) => void;
  onMarkerRemoved?: (markerId: string) => void;
  onZoneClicked?: (zoneId: string) => void;
  onMapEvent?: (event: MapEvent) => void;
  className?: string;
  style?: React.CSSProperties;
};

export default function MapView(props: MapViewProps) {
  const { onMarkerAdded, onMarkerRemoved, onZoneClicked, onMapEvent: externalOnMapEvent, className, style } = props;

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

  // Access centralized data store
  const { markers, getMarker } = useMapData();

  // Handle map events and notify parent
  const handleMapEvent = useCallback((event: MapEvent) => {
    // Notify external handlers
    externalOnMapEvent?.(event);

    switch (event.type) {
      case "markerAdded": {
        setTimeout(() => {
          const marker = getMarker(event.markerId);
          if (marker) {
            onMarkerAdded?.(marker);
          }
        }, 50);
        break;
      }
      case "markerRemoved": {
        onMarkerRemoved?.(event.markerId);
        break;
      }
      case "zoneClicked": {
        onZoneClicked?.(event.zoneId);
        break;
      }
    }
  }, [getMarker, onMarkerAdded, onMarkerRemoved, onZoneClicked, externalOnMapEvent]);

  // Public method to programmatically go to location (for chatbot)
  const goToLocation = useCallback((lat: number, lon: number, zoom?: number, dropMarker?: boolean) => {
    const mgrsText = mgrs.forward([lon, lat], 5) as string;
    setGoToRequest({
      lat,
      lon,
      zoom: zoom ?? 15,
      dropMarker: dropMarker ?? false,
      mgrs: mgrsText,
    });
  }, []);

  // Public method to clear markers (for chatbot)
  const clearMarkers = useCallback(() => {
    setClearToken(t => t + 1);
  }, []);

  // Public method to toggle layers (for chatbot)
  const toggleLayer = useCallback((layer: keyof Toggles, visible: boolean) => {
    setToggles(prev => ({ ...prev, [layer]: visible }));
  }, []);

  // Expose methods to parent via ref (optional)
  React.useImperativeHandle(props.ref, () => ({
    goToLocation,
    clearMarkers,
    toggleLayer,
    getMapInfo: () => info,
    getMarkersCount: () => markersCount,
  }));

  return (
    <div className={className} style={style || { width: "100%", height: "100%" }}>
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

// Export type for ref
export type MapViewRef = {
  goToLocation: (lat: number, lon: number, zoom?: number, dropMarker?: boolean) => void;
  clearMarkers: () => void;
  toggleLayer: (layer: 'zones' | 'markers' | 'heatIncidents', visible: boolean) => void;
  getMapInfo: () => OLInfo;
  getMarkersCount: () => number;
};

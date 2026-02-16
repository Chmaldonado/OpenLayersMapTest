Core Files (Required):

- MapDataContext.tsx - Centralized data store
- types.ts - Type definitions
- OpenLayersTest.tsx - The actual map component
- MapView.tsx - Wrapper for the map
- MapControlDrawer.tsx - The side drawer with controls (for testing)
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Installation Steps:
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Step 1: Install Dependencies

bashnpm install ol mgrs.

Step 2: Copy All Files to Your Project
Copy these 5 files into your src/ folder:

MapDataContext.tsx
types.ts
OpenLayersTest.tsx
MapView.tsx
MapControlDrawer.tsx

Step 3: add to app.tsx

import React, { useState } from 'react';
import MapView from './MapView'; // NEW
import MapControlDrawer, { MapDrawerToggle } from './MapControlDrawer'; // NEW
import { MapDataProvider } from './MapDataContext'; // NEW

export default function App() {
  // Map state
  const [mapDrawerOpen, setMapDrawerOpen] = useState(true);
  const [mapInfo, setMapInfo] = useState({ zoom: 12, centerLatLon: [33.75, -84.39] });
  const [lastClick, setLastClick] = useState(null);
  const [markersCount, setMarkersCount] = useState(0);
  const [eventLog, setEventLog] = useState([]);
  const [clearToken, setClearToken] = useState(0);
  const [toggles, setToggles] = useState({
    zones: true,
    markers: true,
    heatIncidents: true,
  });

  return (
    <MapDataProvider> {/* Wrap everything */}
      <div style={{ display: 'flex', height: '100vh' }}>
        
        {/* Your existing chatbot */}
        <ChatbotDrawer style={{ width: '400px' }} />
        
        {/* NEW: Map section */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapDrawerToggle 
            isOpen={mapDrawerOpen} 
            onToggle={() => setMapDrawerOpen(v => !v)} 
          />
          
          <MapControlDrawer
            isOpen={mapDrawerOpen}
            onToggle={() => setMapDrawerOpen(v => !v)}
            mapInfo={mapInfo}
            lastClick={lastClick}
            markersCount={markersCount}
            onClearMarkers={() => setClearToken(t => t + 1)}
            toggles={toggles}
            onToggleChange={(key, value) => 
              setToggles(prev => ({ ...prev, [key]: value }))
            }
            eventLog={eventLog}
          />
          
          <MapView
            showZones={toggles.zones}
            showMarkers={toggles.markers}
            showHeatIncidents={toggles.heatIncidents}
            requestClearMarkers={clearToken}
            onInfo={setMapInfo}
            onLastClick={setLastClick}
            onMarkersCount={setMarkersCount}
            onMapEvent={(event) => {
              const timestamp = new Date().toLocaleTimeString();
              let msg = '';
              if (event.type === 'markerAdded') {
                msg = `[${timestamp}] Marker added`;
              } else if (event.type === 'markerRemoved') {
                msg = `[${timestamp}] Marker removed`;
              } else if (event.type === 'zoneClicked') {
                msg = `[${timestamp}] Zone clicked`;
              }
              if (msg) setEventLog(prev => [msg, ...prev].slice(0, 10));
            }}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
    </MapDataProvider>
  );
}
```

+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

**That's It!**


- Map with zones, markers, heatmap
- Side drawer with controls
- Event log
- Marker list
- Integration with the existing chatbot

+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

## **Quick Checklist:**
```
- npm install ol mgrs
- Copy MapDataContext.tsx to src/
- Copy types.ts to src/
- Copy OpenLayersTest.tsx to src/
- Copy MapView.tsx to src/
- Copy MapControlDrawer.tsx to src/
- Update your App.tsx
- Wrap everything in <MapDataProvider>
- Add <MapView> and <MapControlDrawer> components
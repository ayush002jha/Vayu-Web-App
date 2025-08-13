// DeliveryAnimation.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Add these imports to fix marker icons
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.webpack.css";
import "leaflet-defaulticon-compatibility";

// Custom icons for better visualization
const storeIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const droneIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const destinationIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function distanceMeters(a: L.LatLng, b: L.LatLng) {
  const dlat = (b.lat - a.lat) * 111_320;
  const dlon = (b.lng - a.lng) * 100_000;
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

export function DeliveryAnimation(): React.ReactElement {
  const [statusText, setStatusText] = useState("Preparing...");
  const [currentUserLocation, setCurrentUserLocation] =
    useState<L.LatLng | null>(null);
  const [droneInitialLocation, setDroneInitialLocation] =
    useState<L.LatLng | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [dronePosition, setDronePosition] = useState<L.LatLngTuple | null>(
    null
  );
  const [progress, setProgress] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const [pathLine, setPathLine] = useState<L.LatLngTuple[] | null>(null);
  const [totalDistance, setTotalDistance] = useState<number>(0);

  useEffect(() => {
    // FOR TESTING: Use hardcoded coordinates instead of geolocation
    setStatusText("Using test location...");

    // Replace these with your desired test coordinates
    const testLat = 47.396831;
    const testLng = 8.546584;

    const latlng = L.latLng(testLat, testLng);
    setCurrentUserLocation(latlng);
    setStatusText("Getting drone location...");

    /* 
  // ORIGINAL GEOLOCATION CODE (commented out for testing)
  if (!navigator.geolocation) {
    setLocationError("Geolocation is not supported by your browser.");
    setStatusText("Geolocation Error");
    return;
  }
  
  setStatusText("Fetching your location...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      setCurrentUserLocation(latlng);
      setStatusText("Getting drone location...");
    },
    (err) => {
      setLocationError(err.message || "Could not fetch your location.");
      setStatusText("Location Error");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
  */
  }, []);

  // Get drone's initial location and start telemetry
  useEffect(() => {
    if (!currentUserLocation) return;

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket("wss://famous-eternal-pipefish.ngrok-free.app/ws/telemetry");
    wsRef.current = ws;

    let initialPositionSet = false;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setWsConnected(true);
      setStatusText("Getting drone position...");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received telemetry:", data);

        if (data?.lat && data?.lon) {
          const pos: L.LatLngTuple = [data.lat, data.lon];

          // Set initial drone position as "store" location (only once)
          if (!initialPositionSet && !droneInitialLocation) {
            const initialPos = L.latLng(data.lat, data.lon);
            setDroneInitialLocation(initialPos);
            setDronePosition(pos);

            // Calculate path from drone's initial position to user location
            const pathPoints: L.LatLngTuple[] = [
              [initialPos.lat, initialPos.lng],
              [currentUserLocation.lat, currentUserLocation.lng],
            ];
            setPathLine(pathPoints);
            setTotalDistance(distanceMeters(initialPos, currentUserLocation));

            initialPositionSet = true;
            setStatusText("Drone located. Mission in progress...");
            return;
          }

          // Update moving drone position
          setDronePosition(pos);

          // Calculate progress if we have initial position
          if (droneInitialLocation) {
            const currentDronePos = L.latLng(pos[0], pos[1]);
            const distanceFromStart = distanceMeters(
              droneInitialLocation,
              currentDronePos
            );
            const p = Math.max(
              0,
              Math.min(
                100,
                (distanceFromStart / Math.max(totalDistance, 1)) * 100
              )
            );
            setProgress(p);

            if (p >= 95) {
              setStatusText("Arriving at destination...");
            } else {
              setStatusText(`In transit (${p.toFixed(0)}%)`);
            }
          }
        } else if (data?.error) {
          setStatusText("Telemetry error: " + data.error);
        }
      } catch (e) {
        console.warn("Failed to parse WebSocket message:", event.data);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setWsConnected(false);
      setStatusText("Telemetry connection error");
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      setWsConnected(false);
    };

    // Cleanup function
    return () => {
      console.log("Cleaning up WebSocket");
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [currentUserLocation, droneInitialLocation, totalDistance]);

  if (locationError) {
    return (
      <div className="flex flex-col justify-center items-center h-80 md:h-96 py-10 px-4 text-center">
        <p className="text-lg font-medium text-red-600">
          Error: {locationError}
        </p>
        <p className="text-sm text-gray-500 mt-2">{statusText}</p>
      </div>
    );
  }

  const mapCenter = useMemo(() => {
    if (currentUserLocation && droneInitialLocation) {
      return L.latLngBounds([
        [droneInitialLocation.lat, droneInitialLocation.lng],
        [currentUserLocation.lat, currentUserLocation.lng],
      ]).getCenter();
    } else if (droneInitialLocation) {
      return droneInitialLocation;
    } else if (currentUserLocation) {
      return currentUserLocation;
    }
    return L.latLng(13.069768, 77.541407); // fallback
  }, [currentUserLocation, droneInitialLocation]);

  const mapZoom = useMemo(() => {
    if (currentUserLocation && droneInitialLocation) {
      const bounds = L.latLngBounds([
        [droneInitialLocation.lat, droneInitialLocation.lng],
        [currentUserLocation.lat, currentUserLocation.lng],
      ]);
      // Calculate appropriate zoom based on bounds
      const distance = distanceMeters(
        droneInitialLocation,
        currentUserLocation
      );
      if (distance < 500) return 15;
      if (distance < 1000) return 14;
      if (distance < 2000) return 13;
      return 12;
    }
    return 13;
  }, [currentUserLocation, droneInitialLocation]);

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-3xl mx-auto py-10 px-2">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Your Drone Delivery Status
      </h2>

      {/* Connection status indicator */}
      <div className="mb-4 flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
        wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
          }`}
        ></div>
        <span className="text-sm text-gray-600">
          {wsConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="relative w-full h-96 md:h-[500px] bg-gray-300 rounded-lg mb-8 overflow-hidden border border-gray-300 shadow-lg">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
          key={`${droneInitialLocation?.lat}-${droneInitialLocation?.lng}-${currentUserLocation?.lat}-${currentUserLocation?.lng}`}
        >
          <TileLayer
            attribution="© OpenStreetMap contributors"
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {/* Store/Initial Drone Location (Green marker) */}
          {droneInitialLocation && (
            <Marker
              position={[droneInitialLocation.lat, droneInitialLocation.lng]}
              icon={storeIcon}
            >
              <Popup>
                <div>
                  <strong>🏪 Drone Base</strong>
                  <br />
                  Initial Position
                  <br />
                  <small>
                    Lat: {droneInitialLocation.lat.toFixed(6)}
                    <br />
                    Lng: {droneInitialLocation.lng.toFixed(6)}
                  </small>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Destination marker (Red marker) */}
          {currentUserLocation && (
            <Marker
              position={[currentUserLocation.lat, currentUserLocation.lng]}
              icon={destinationIcon}
            >
              <Popup>
                <div>
                  <strong>🎯 Delivery Destination</strong>
                  <br />
                  Your Location
                  <br />
                  <small>
                    Lat: {currentUserLocation.lat.toFixed(6)}
                    <br />
                    Lng: {currentUserLocation.lng.toFixed(6)}
                  </small>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Flight path line */}
          {pathLine && (
            <Polyline
              positions={pathLine}
              pathOptions={{
                color: "#0ea5e9",
                weight: 3,
                dashArray: "5, 5",
                opacity: 0.7,
              }}
            />
          )}

          {/* Live drone marker (Blue marker) */}
          {dronePosition && (
            <Marker position={dronePosition} icon={droneIcon}>
              <Popup>
                <div>
                  <strong>🚁 Live Drone Position</strong>
                  <br />
                  Current Location
                  <br />
                  <small>
                    Lat: {dronePosition[0].toFixed(6)}
                    <br />
                    Lng: {dronePosition[1].toFixed(6)}
                  </small>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Progress Bar and Status */}
      <div className="w-full max-w-md px-4">
        <div className="flex justify-between text-xs mb-1 text-gray-500 font-medium px-1">
          <span>🏪 Base</span>
          <span
            className={`transition-opacity duration-300 ${
              progress > 5 && progress < 95 ? "opacity-100" : "opacity-50"
            }`}
          >
            🚁 In Flight
          </span>
          <span
            className={`transition-opacity duration-300 ${
              progress >= 95 ? "opacity-100" : "opacity-50"
            }`}
          >
            🎯 Delivered
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 mb-3 overflow-hidden shadow-inner">
          <div
            className="bg-gradient-to-r from-blue-400 to-sky-500 h-3 rounded-full transition-all duration-150 ease-linear"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Delivery progress"
          />
        </div>
        <p className="text-center text-gray-700 h-5 text-sm font-medium">
          {statusText}
        </p>
        <p className="text-center text-xs text-gray-500 mt-1">
          Progress: {progress.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}

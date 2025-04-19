// src/components/DeliveryAnimation.tsx (or your preferred file path)

"use client"; // For Next.js App Router

import React, { useEffect, useState, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L, { LatLngExpression, LatLng } from 'leaflet'; // Import types
import 'leaflet/dist/leaflet.css';

// --- CSS Styles (Optional: Can be moved to a separate CSS file) ---
const animationStyles = `
  @keyframes pulse {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.8; }
    100% { transform: scale(1); opacity: 1; }
  }
  .destination-icon {
    /* Add styles if needed */
  }
`;

// --- Configuration ---
const STORE_COORDS: L.LatLngTuple = [13.069768, 77.541407];
const storeLatLng: L.LatLng = L.latLng(STORE_COORDS);
const USER_COORDS_FOR_TESTING: L.LatLngTuple = [12.9716, 77.6946];
const DELIVERY_TIME_SECONDS: number = 25;
const CURVE_STEPS: number = 50; // Number of points for the curved path

// --- Helper Function for Curved Line Points ---
function getCurvedLinePoints(start: L.LatLng, end: L.LatLng, steps: number = CURVE_STEPS): L.LatLngExpression[] {
    const points: L.LatLngExpression[] = [];
    const latOffset = (end.lng - start.lng) * 0.12;
    const lngOffset = (start.lat - end.lat) * 0.12;
    const controlPoint = L.latLng(
      (start.lat + end.lat) / 2 + latOffset,
      (start.lng + end.lng) / 2 + lngOffset
    );

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lat = (1 - t) * (1 - t) * start.lat + 2 * (1 - t) * t * controlPoint.lat + t * t * end.lat;
      const lng = (1 - t) * (1 - t) * start.lng + 2 * (1 - t) * t * controlPoint.lng + t * t * end.lng;
      if (isFinite(lat) && isFinite(lng)) {
          points.push([lat, lng]);
      } else {
          console.warn(`>>> Invalid point generated at step ${i} (t=${t}): [${lat}, ${lng}]`);
      }
    }
    // Ensure the final exact end point is included
    if (points.length > 0) {
      const lastPoint = points[points.length - 1];
      if (Array.isArray(lastPoint) && (lastPoint[0] !== end.lat || lastPoint[1] !== end.lng)) {
          if (isFinite(end.lat) && isFinite(end.lng)) {
              points.push([end.lat, end.lng]);
          }
      }
    } else if (isFinite(end.lat) && isFinite(end.lng)) {
      // Handle case where only start/end are valid
      if (isFinite(start.lat) && isFinite(start.lng)) {
          points.push([start.lat, start.lng]);
      }
      points.push([end.lat, end.lng]);
    }
    return points;
}

// --- Custom Leaflet Icons ---

const storeIcon: L.Icon = new L.Icon({
  iconUrl: '/icons/store.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
});

const destinationIcon: L.DivIcon = new L.DivIcon({
    className: 'destination-icon',
    html: `<div style="background-color:#0ea5e9;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px rgba(14, 165, 233, 0.7);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

const droneImageIcon: L.Icon = new L.Icon({
    iconUrl: '/icons/drone.png', // Path to your drone image
    iconSize: [35, 35],       // Adjust size
    iconAnchor: [17.5, 17.5], // Adjust anchor to center
    popupAnchor: [0, -17.5],
});

// --- Delivery Path Component ---
interface DeliveryPathProps {
    pathPoints: L.LatLngExpression[] | null;
}

function DeliveryPath({ pathPoints }: DeliveryPathProps): React.ReactElement | null {
    if (!pathPoints || pathPoints.length < 2) return null;
    return (
      <Polyline
        positions={pathPoints}
        pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '8, 8', opacity: 0.7 }}
      />
    );
}

// --- Map Adjustment Component ---
interface MapBoundsAdjusterProps {
    storeLoc: L.LatLngExpression;
    userLoc: L.LatLng | null;
}

function MapBoundsAdjuster({ storeLoc, userLoc }: MapBoundsAdjusterProps): null {
    const map = useMap();
    useEffect(() => {
      if (userLoc instanceof L.LatLng) {
        const bounds = L.latLngBounds([storeLoc, userLoc]);
        map.flyToBounds(bounds, { padding: [50, 50], duration: 1.2 });
      } else {
        map.flyTo(storeLoc, 13, { duration: 1 });
      }
    }, [storeLoc, userLoc, map]);
    return null;
}


// --- Main Delivery Animation Component ---
export function DeliveryAnimation(): React.ReactElement {
  const [progress, setProgress] = useState<number>(0);
  const [dronePosition, setDronePosition] = useState<L.LatLngExpression>(STORE_COORDS);
  const [estimatedTime, setEstimatedTime] = useState<number>(DELIVERY_TIME_SECONDS);
  const [currentUserLocation, setCurrentUserLocation] = useState<L.LatLng | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(true);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>("Preparing...");
  const [deliveryPathPoints, setDeliveryPathPoints] = useState<L.LatLngExpression[] | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Effect to Get Location (MODIFIED: Using Geolocation API) ---
  useEffect(() => {
    // --- Using Geolocation API ---
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by this browser.");
      setLocationError("Geolocation is not supported by your browser.");
      setIsLocating(false);
      setStatusText("Geolocation Error");
      return; // Exit if not supported
    }

    console.log(">>> Effect: Attempting to fetch user location...");
    // isLocating is already true, statusText set initially

    const successCallback = (position: GeolocationPosition) => { // Add explicit type
      const { latitude, longitude } = position.coords;
      console.log(`>>> User location fetched successfully: Lat: ${latitude}, Lng: ${longitude}`);
      setCurrentUserLocation(L.latLng(latitude, longitude)); // Create LatLng object
      setIsLocating(false); // Location found
      setLocationError(null); // Clear any previous error
      setStatusText("Calculating route..."); // Update status
    };

    const errorCallback = (error: GeolocationPositionError) => { // Add explicit type
      console.error("!!! Error getting user location:", error.message, `(Code: ${error.code})`);
      let message = "Could not fetch your location.";
      // Provide more specific error messages based on the error code
      if (error.code === error.PERMISSION_DENIED) {
        message = "Location access denied. Please enable location permissions for this site.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        message = "Location information is unavailable.";
      } else if (error.code === error.TIMEOUT) {
        message = "The request to get user location timed out.";
      }
      setLocationError(message);
      setIsLocating(false); // Finished locating (even though it failed)
      setStatusText("Location Error"); // Update status
    };

    // Options for the geolocation request
    const options: PositionOptions = {
      enableHighAccuracy: true, // Request more accurate position (may use more battery)
      timeout: 10000,         // Maximum time (in milliseconds) to wait for a position (10 seconds)
      maximumAge: 0           // Don't use a cached position, get a fresh one
    };

    // Make the request
    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);

    // --- Hardcoded Location (Keep commented out for reference/testing) ---
    /*
    console.log(">>> Effect: Setting hardcoded user location for testing.");
    const userLatLng = L.latLng(USER_COORDS_FOR_TESTING[0], USER_COORDS_FOR_TESTING[1]);
    setCurrentUserLocation(userLatLng);
    setIsLocating(false);
    setLocationError(null);
    setStatusText("Calculating route...");
    */

  }, []); // Runs only once on component mount to fetch location

  // --- Effect to Calculate Path ---
  useEffect(() => {
    if (currentUserLocation instanceof L.LatLng) {
       console.log(">>> Effect: Location valid. Calculating curve points...");
       const points = getCurvedLinePoints(storeLatLng, currentUserLocation, CURVE_STEPS);
       if (points && points.length >= 2) {
          setDeliveryPathPoints(points);
          setDronePosition(points[0]); // Start drone at path start
          console.log(`>>> Path points calculated (${points.length}). Ready. Start:`, points[0]);
          setStatusText("Ready to depart...");
       } else {
          console.error("!!! Path calculation failed.");
          setDeliveryPathPoints(null);
          setDronePosition(STORE_COORDS);
          setStatusText("Route unavailable");
          setLocationError("Could not calculate a valid delivery route.");
       }
    } else {
       setDeliveryPathPoints(null);
       setDronePosition(STORE_COORDS);
       if (!isLocating && !locationError) {
           setStatusText("Waiting for destination...");
       }
    }
  }, [currentUserLocation, isLocating, locationError]);


  // --- Effect to Run Drone Animation ---
  useEffect(() => {
    console.log(`>>> Effect: Animation Triggered. Path available: ${!!deliveryPathPoints}, Points: ${deliveryPathPoints?.length}`);

    if (deliveryPathPoints && deliveryPathPoints.length >= 2) {
      console.log(">>> Valid path found - Setting up animation interval.");
      setIsAnimating(true);
      setStatusText("Drone departed!");

      const totalSteps = deliveryPathPoints.length;
      let currentStep = 0;

      setProgress(0);
      setEstimatedTime(DELIVERY_TIME_SECONDS);
      setDronePosition(deliveryPathPoints[0]);

      if (totalSteps <= 1) {
          console.warn("!!! Animation Warning: Path has 1 or 0 points.");
          setProgress(100); setEstimatedTime(0); setIsAnimating(false);
          if (currentUserLocation) setDronePosition([currentUserLocation.lat, currentUserLocation.lng]);
          setStatusText("✅ Drone has arrived!");
          return;
      }

      const intervalTime = (DELIVERY_TIME_SECONDS * 1000) / (totalSteps - 1);
      console.log(`>>> Calculated Interval Time: ${intervalTime.toFixed(2)}ms`);

      if (intervalTime <= 0 || !isFinite(intervalTime)) {
          console.error(`!!! Animation Failed: Invalid interval time (${intervalTime}).`);
          setIsAnimating(false); setStatusText("Animation Error"); return;
      }
      if (intervalRef.current) {
          console.warn(">>> Clearing leftover interval.");
          clearInterval(intervalRef.current); intervalRef.current = null;
      }

      console.log(">>> Starting setInterval animation loop...");
      intervalRef.current = setInterval(() => {
        if (currentStep < totalSteps) {
          const nextPos = deliveryPathPoints[currentStep];

          // --- CRITICAL VALIDATION ---
          if (Array.isArray(nextPos) && nextPos.length === 2 && typeof nextPos[0] === 'number' && typeof nextPos[1] === 'number' && isFinite(nextPos[0]) && isFinite(nextPos[1])) {
             setDronePosition(nextPos);
          } else {
             console.error(`!!! Invalid position data at step ${currentStep}:`, nextPos, "- Stopping animation.");
             if (intervalRef.current) clearInterval(intervalRef.current);
             intervalRef.current = null; setIsAnimating(false); setStatusText("Animation Error: Invalid path data");
             if (currentUserLocation) setDronePosition([currentUserLocation.lat, currentUserLocation.lng]);
             return;
          }
          // --- END VALIDATION ---

          const currentProgress = currentStep / (totalSteps - 1);
          const displayProgress = Math.min(currentProgress * 100, 100);
          const displayTime = Math.max(0, DELIVERY_TIME_SECONDS * (1 - currentProgress));

          setProgress(displayProgress);
          setEstimatedTime(displayTime);
          if (displayProgress < 100) {
             setStatusText(`Estimated arrival in ${Math.ceil(displayTime)} seconds`);
          }
          currentStep++;

        } else {
          // Animation complete
          console.log(">>> Animation Complete: Stopping interval.");
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;

          // --- Final State Updates ---
          if (currentUserLocation instanceof L.LatLng) {
              const finalPos: L.LatLngExpression = [currentUserLocation.lat, currentUserLocation.lng];
               if (Array.isArray(finalPos) && finalPos.length === 2 && typeof finalPos[0] === 'number' && typeof finalPos[1] === 'number' && isFinite(finalPos[0]) && isFinite(finalPos[1])) {
                   setDronePosition(finalPos);
                   console.log(">>> Final position set to user location:", finalPos);
               } else {
                   console.error("!!! Invalid final user location, attempting fallback:", finalPos);
                   const lastValidPathPoint = deliveryPathPoints[deliveryPathPoints.length - 1];
                   if (Array.isArray(lastValidPathPoint) && lastValidPathPoint.length === 2 && typeof lastValidPathPoint[0] === 'number' && typeof lastValidPathPoint[1] === 'number' && isFinite(lastValidPathPoint[0]) && isFinite(lastValidPathPoint[1])) {
                       setDronePosition(lastValidPathPoint);
                       console.log(">>> Final position set to last valid path point (fallback):", lastValidPathPoint);
                   } else { console.error("!!! Fallback failed - last path point also invalid."); }
               }
          } else {
               console.warn(">>> No valid currentUserLocation at animation end. Using last path point.");
               const lastValidPathPoint = deliveryPathPoints[deliveryPathPoints.length - 1];
               if (Array.isArray(lastValidPathPoint) && lastValidPathPoint.length === 2 && typeof lastValidPathPoint[0] === 'number' && typeof lastValidPathPoint[1] === 'number' && isFinite(lastValidPathPoint[0]) && isFinite(lastValidPathPoint[1])) {
                    setDronePosition(lastValidPathPoint);
               }
          }

          setProgress(100);
          setEstimatedTime(0);
          setIsAnimating(false);
          setStatusText("✅ Drone has arrived!");
        }
      }, intervalTime);

      console.log(">>> Interval Started with ID:", intervalRef.current);

      // --- Cleanup Function ---
      return () => {
        console.log(">>> Cleanup: Clearing animation interval (if any) ref:", intervalRef.current);
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsAnimating(false);
      };

    } else {
        console.log(">>> Animation effect skipped: No valid path points.");
        setIsAnimating(false);
    }
  }, [deliveryPathPoints, currentUserLocation]); // Dependencies


  // --- Memoized Map Center and Zoom ---
  const mapCenter = useMemo<L.LatLng>(() => {
    return currentUserLocation instanceof L.LatLng
      ? L.latLngBounds(storeLatLng, currentUserLocation).getCenter()
      : storeLatLng;
  }, [currentUserLocation]);

  const mapInitialZoom = useMemo<number>(() => {
      return currentUserLocation instanceof L.LatLng ? 12 : 13;
  }, [currentUserLocation]);


  // --- Render Logic ---

  if (isLocating) {
    return (
      <div className="flex flex-col justify-center items-center h-80 md:h-96 py-10">
        <p className="text-lg font-medium">{statusText}</p>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mt-4"></div>
      </div>
    );
  }

  if (locationError) {
     return (
      <div className="flex flex-col justify-center items-center h-80 md:h-96 py-10 px-4 text-center">
         <p className="text-lg font-medium text-red-600">Error: {locationError}</p>
         <p className="text-sm text-gray-500 mt-2">{statusText}</p>
     </div>
     );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-3xl mx-auto py-10 px-2">
      <style>{animationStyles}</style>

      <h2 className="text-2xl font-bold mb-6 text-gray-800">Your Drone Delivery Status</h2>

      <div className="relative w-full h-96 md:h-[500px] bg-gray-300 rounded-lg mb-8 overflow-hidden border border-gray-300 shadow-lg">
        <MapContainer
           key={currentUserLocation ? `map-${currentUserLocation.lat.toFixed(5)}-${currentUserLocation.lng.toFixed(5)}` : 'map-loading'}
           center={mapCenter}
           zoom={mapInitialZoom}
           scrollWheelZoom={true}
           style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <MapBoundsAdjuster storeLoc={STORE_COORDS} userLoc={currentUserLocation} />
          <DeliveryPath pathPoints={deliveryPathPoints} />

          <Marker position={STORE_COORDS} icon={storeIcon} zIndexOffset={100}>
            <Popup><span className="font-semibold">Store Location</span><br /> Pickup Point</Popup>
          </Marker>

          {currentUserLocation instanceof L.LatLng && (
            <Marker
                position={currentUserLocation}
                icon={destinationIcon} // Use blue ball
                zIndexOffset={100}
            >
              <Popup><span className="font-semibold">Your Location</span><br /> Drop-off Point</Popup>
            </Marker>
          )}

          {/* Animated Drone Marker */}
          <Marker
             position={dronePosition}
             icon={droneImageIcon} // Use drone image
             zIndexOffset={1000}
          />
        </MapContainer>
      </div>

       {/* Progress Bar and Status Text */}
       <div className="w-full max-w-md px-4">
         <div className="flex justify-between text-xs mb-1 text-gray-500 font-medium px-1">
           <span>Departed Store</span>
           <span className={`transition-opacity duration-300 ${progress > 5 && progress < 95 ? 'opacity-100' : 'opacity-50'}`}>
             In Transit
           </span>
           <span className={`transition-opacity duration-300 ${progress >= 100 ? 'opacity-100' : 'opacity-50'}`}>
               Arrived
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
           ></div>
         </div>
         <p className="text-center text-gray-700 h-5 text-sm font-medium">
            {statusText}
         </p>
       </div>
    </div>
  );
}
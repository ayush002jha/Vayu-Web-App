"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet'; // Import Leaflet library
import 'leaflet/dist/leaflet.css'; // Ensure CSS is imported
import { MapPin, Store, Send } from "lucide-react"; // Using Send icon for drone

// --- Configuration ---
const STORE_LOCATION: L.LatLngExpression = [12.9716, 77.5946]; // Example: Bangalore coordinates (Replace with actual store Lat/Lng)
const DELIVERY_TIME_SECONDS = 30; // Total time for the drone animation in seconds
const ANIMATION_INTERVAL_MS = 100; // Update frequency in milliseconds
// --- End Configuration ---

// --- Helper Function for Linear Interpolation ---
function interpolateLatLng(start: L.LatLng, end: L.LatLng, factor: number): L.LatLngExpression {
  const lat = start.lat + (end.lat - start.lat) * factor;
  const lng = start.lng + (end.lng - start.lng) * factor;
  return [lat, lng];
}

// --- Custom Drone Icon ---
// You might need to adjust icon paths or use base64 URLs if icons don't load
// Ensure these icon files are accessible in your public folder
const storeIcon = new L.Icon({
  iconUrl: '/icons/store.png', // Replace with your store icon path
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
});

const dropOffIcon = new L.Icon({
  iconUrl: '/icons/pin.png', // Replace with your drop-off pin icon path
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
});

const droneIcon = new L.Icon({
    iconUrl: '/icons/drone.png', // Replace with your drone icon path
    iconSize: [35, 35],
    iconAnchor: [17, 17], // Center of the icon
    className: 'drone-icon' // Optional: for custom CSS if needed
});

// --- Map Adjustment Component ---
// Helper component to adjust map bounds when locations change
function MapBoundsAdjuster({ storeLoc, userLoc }: { storeLoc: L.LatLngExpression, userLoc: L.LatLngExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (userLoc) {
      const bounds = L.latLngBounds([storeLoc, userLoc]);
      map.flyToBounds(bounds, { padding: [50, 50] }); // Adjust padding as needed
    } else {
      // If user location isn't available yet, center on store
      map.flyTo(storeLoc, 13); // Adjust zoom level as needed
    }
  }, [storeLoc, userLoc, map]);
  return null; // This component doesn't render anything visible
}

// --- Main Component ---
export function DeliveryAnimation() {
  const [progress, setProgress] = useState(0);
  const [dronePosition, setDronePosition] = useState<L.LatLngExpression | null>(STORE_LOCATION);
  const [estimatedTime, setEstimatedTime] = useState(DELIVERY_TIME_SECONDS);
  const [currentUserLocation, setCurrentUserLocation] = useState<L.LatLng | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [animationStarted, setAnimationStarted] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const storeLatLng = L.latLng(STORE_LOCATION[0], STORE_LOCATION[1]);

  // 1. Get User's Current Location
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      setIsLocating(false);
      return;
    }

    const successCallback = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      console.log("User location fetched:", latitude, longitude);
      setCurrentUserLocation(L.latLng(latitude, longitude));
      setIsLocating(false);
      setLocationError(null);
    };

    const errorCallback = (error: GeolocationPositionError) => {
      console.error("Error getting location:", error);
      let message = "Could not fetch your location.";
      if (error.code === error.PERMISSION_DENIED) {
        message = "Location access denied. Please enable location permissions.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        message = "Location information is unavailable.";
      } else if (error.code === error.TIMEOUT) {
        message = "The request to get user location timed out.";
      }
      setLocationError(message);
      setIsLocating(false);
      // Optionally set a default fallback location if needed
      // setCurrentUserLocation(L.latLng(FALLBACK_LAT, FALLBACK_LNG));
    };

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, {
      enableHighAccuracy: true,
      timeout: 10000, // 10 seconds
      maximumAge: 0 // Force fresh location
    });

  }, []); // Run only once on mount

  // 2. Start Animation once user location is available
  useEffect(() => {
    if (currentUserLocation && !animationStarted) {
      setAnimationStarted(true);
      const totalSteps = (DELIVERY_TIME_SECONDS * 1000) / ANIMATION_INTERVAL_MS;
      let currentStep = 0;

      intervalRef.current = setInterval(() => {
        currentStep++;
        const currentProgress = Math.min(currentStep / totalSteps, 1);

        // Calculate drone position
        const newDronePos = interpolateLatLng(storeLatLng, currentUserLocation, currentProgress);
        setDronePosition(newDronePos);

        // Update progress bar
        setProgress(currentProgress * 100);

        // Update estimated time
        setEstimatedTime(Math.max(0, DELIVERY_TIME_SECONDS * (1 - currentProgress)));

        if (currentProgress >= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setDronePosition(currentUserLocation.wrap()); // Ensure drone snaps to final location
          setProgress(100);
          setEstimatedTime(0);
        }
      }, ANIMATION_INTERVAL_MS);

      // Cleanup interval on component unmount or if dependencies change
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [currentUserLocation, storeLatLng, animationStarted]); // Depend on user location and start flag

  // --- Render Logic ---
  if (isLocating) {
    return <div className="flex justify-center items-center h-60">Fetching your location...</div>;
  }

  if (locationError) {
     return <div className="flex flex-col justify-center items-center h-60 text-red-600">
         <p>Error: {locationError}</p>
         <p className="text-sm text-gray-500 mt-2">Please ensure location services are enabled and permissions granted.</p>
     </div>;
  }

  // Render map only when we potentially have a user location (or fallback)
  const mapCenter = currentUserLocation
    ? L.latLngBounds([STORE_LOCATION, [currentUserLocation.lat, currentUserLocation.lng]]).getCenter()
    : STORE_LOCATION;

  const mapInitialZoom = currentUserLocation ? 12 : 13; // Zoom out more if showing route


  return (
    <div className="flex flex-col items-center justify-center h-full py-10">
      <h2 className="text-xl font-bold mb-6">Your Drone is on the way!</h2>

      {/* Map Container */}
      <div className="relative w-full h-80 md:h-96 bg-gray-200 rounded-lg mb-6 overflow-hidden border border-gray-300">
         {/* Ensure Leaflet container has explicit height */}
        <MapContainer
          center={mapCenter}
          zoom={mapInitialZoom}
          scrollWheelZoom={true} // Enable scroll wheel zoom
          style={{ height: '100%', width: '100%' }}
        >
          {/* OpenStreetMap Tile Layer */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Adjust map bounds dynamically */}
          <MapBoundsAdjuster storeLoc={STORE_LOCATION} userLoc={currentUserLocation ? [currentUserLocation.lat, currentUserLocation.lng] : null} />

          {/* Store Marker */}
          <Marker position={STORE_LOCATION} icon={storeIcon}>
            <Popup>
              Store Location <br /> Pickup Point
            </Popup>
          </Marker>

          {/* Drop Off Marker (only if location available) */}
          {currentUserLocation && (
            <Marker position={[currentUserLocation.lat, currentUserLocation.lng]} icon={dropOffIcon}>
              <Popup>
                Your Location <br /> Drop-off Point
              </Popup>
            </Marker>
          )}

          {/* Animated Drone Marker (only if animation started) */}
          {dronePosition && animationStarted && (
             <Marker position={dronePosition} icon={droneIcon}>
                {/* Optional: Add a popup to the drone */}
                {/* <Popup>Drone en route</Popup> */}
             </Marker>
          )}

        </MapContainer>
      </div>

       {/* Progress Bar and Time */}
       <div className="w-full max-w-md px-4">
         <div className="flex justify-between text-sm mb-1 text-gray-600">
           <span>Store</span>
           <span>In Transit</span>
           <span>Delivered</span>
         </div>
         <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
           <div
             className="bg-blue-600 h-2.5 rounded-full transition-width duration-100 ease-linear" // Use CSS transition for smoother width change
             style={{ width: `${progress}%` }}
           ></div>
         </div>
         <p className="text-center text-gray-500">
           {progress === 100
             ? "Drone has arrived!"
             : `Estimated delivery in ${Math.max(0, Math.ceil(estimatedTime))} seconds`}
         </p>
       </div>
    </div>
  );
}
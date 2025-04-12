"use client";

import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css'; // Ensure CSS is imported (ideally globally)
import { MapPin, Store, Send } from "lucide-react"; // Using Send icon for drone representation if needed, but custom icon is primary

// --- Configuration ---
// Define coordinates as a clear tuple (Using Bangalore coordinates as requested)
const STORE_COORDS: L.LatLngTuple = [12.9716, 77.5946]; // Example: Bangalore (Vidhana Soudha area)

// Create a Leaflet LatLng object from the tuple for consistent use
const storeLatLng: L.LatLng = L.latLng(STORE_COORDS);

const DELIVERY_TIME_SECONDS = 30; // Total time for the drone animation in seconds
const ANIMATION_INTERVAL_MS = 100; // Update frequency in milliseconds (lower = smoother but more updates)
// --- End Configuration ---

// --- Helper Function for Linear Interpolation ---
// Ensure inputs are L.LatLng for guaranteed .lat/.lng access
function interpolateLatLng(start: L.LatLng, end: L.LatLng, factor: number): L.LatLngExpression {
  const lat = start.lat + (end.lat - start.lat) * factor;
  const lng = start.lng + (end.lng - start.lng) * factor;
  // Return as tuple (LatLngExpression) which is fine for Leaflet components/state
  return [lat, lng];
}

// --- Custom Leaflet Icons ---
// Ensure these icon files are accessible in your public/icons/ folder
const storeIcon = new L.Icon({
  iconUrl: '/icons/store.png', // Replace with your store icon path
  iconSize: [30, 30],
  iconAnchor: [15, 30], // Point of the icon which corresponds to marker's location
  popupAnchor: [0, -30], // Point from which the popup should open relative to the iconAnchor
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
    iconSize: [35, 35], // Adjust size as needed
    iconAnchor: [17, 17], // Center the icon anchor
    className: 'drone-icon' // Optional: for custom CSS if needed
});

// --- Map Adjustment Component ---
// Helper component to adjust map bounds when locations change
function MapBoundsAdjuster({ storeLoc, userLoc }: { storeLoc: L.LatLngExpression, userLoc: L.LatLng | null }) {
  const map = useMap(); // Hook to get the map instance
  useEffect(() => {
    if (userLoc instanceof L.LatLng) {
      // Create bounds including both store and user location
      const bounds = L.latLngBounds([storeLoc, userLoc]);
      console.log("Adjusting map bounds to fit:", bounds); // Debug log
      // Animate the map view to fit the bounds
      map.flyToBounds(bounds, { padding: [50, 50], duration: 1 }); // Adjust padding & duration
    } else {
      // If user location isn't available yet, center on the store
      console.log("Centering map on store:", storeLoc); // Debug log
      map.flyTo(storeLoc, 13, { duration: 1 }); // Adjust zoom level & duration
    }
  }, [storeLoc, userLoc, map]); // Re-run effect if locations or map instance changes

  return null; // This component doesn't render anything visible
}

// --- Main Delivery Animation Component ---
export function DeliveryAnimation() {
  // State variables
  const [progress, setProgress] = useState(0); // Animation progress (0-100)
  const [dronePosition, setDronePosition] = useState<L.LatLngExpression | null>(storeLatLng); // Drone's current map position
  const [estimatedTime, setEstimatedTime] = useState(DELIVERY_TIME_SECONDS); // Estimated time remaining
  const [currentUserLocation, setCurrentUserLocation] = useState<L.LatLng | null>(null); // User's fetched location
  const [locationError, setLocationError] = useState<string | null>(null); // Error message for geolocation
  const [isLocating, setIsLocating] = useState(true); // Flag while fetching location
  const [animationStarted, setAnimationStarted] = useState(false); // Flag to ensure animation starts only once

  const intervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to hold the animation interval ID

  // 1. Effect to Get User's Current Location on Mount
  useEffect(() => {
    // Check if Geolocation API is available
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      setIsLocating(false);
      return;
    }

    console.log("Attempting to fetch user location..."); // Debug log
    setIsLocating(true);

    const successCallback = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      console.log(`User location fetched successfully: Lat: ${latitude}, Lng: ${longitude}`); // Debug log
      // Create an L.LatLng object for consistent use
      setCurrentUserLocation(L.latLng(latitude, longitude));
      setIsLocating(false);
      setLocationError(null);
    };

    const errorCallback = (error: GeolocationPositionError) => {
      console.error("Error getting user location:", error.message, `(Code: ${error.code})`); // Debug log
      let message = "Could not fetch your location.";
      if (error.code === error.PERMISSION_DENIED) {
        message = "Location access denied. Please enable location permissions for this site.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        message = "Location information is currently unavailable.";
      } else if (error.code === error.TIMEOUT) {
        message = "The request to get user location timed out.";
      }
      setLocationError(message);
      setIsLocating(false);
      // Optionally set a default fallback location if needed for testing
      // setCurrentUserLocation(L.latLng(FALLBACK_LAT, FALLBACK_LNG));
    };

    // Request the current position
    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, {
      enableHighAccuracy: true, // Request more accurate position
      timeout: 10000, // Maximum time (in milliseconds) to wait for a location
      maximumAge: 0 // Don't use a cached position, get a fresh one
    });

  }, []); // Empty dependency array ensures this runs only once on mount

  // 2. Effect to Start and Run the Drone Animation
  useEffect(() => {
    // Start animation only if user location is a valid L.LatLng object and animation hasn't started
    if (currentUserLocation instanceof L.LatLng && !animationStarted) {
      console.log("Starting animation effect. Target:", currentUserLocation); // Debug log
      setAnimationStarted(true);
      // Ensure drone starts exactly at the store position visually
      setDronePosition(storeLatLng);

      const totalSteps = (DELIVERY_TIME_SECONDS * 1000) / ANIMATION_INTERVAL_MS;
      let currentStep = 0;

      console.log(`Animation details: Duration=${DELIVERY_TIME_SECONDS}s, Interval=${ANIMATION_INTERVAL_MS}ms, Steps=${totalSteps}`); // Debug log

      // Start the interval timer
      intervalRef.current = setInterval(() => {
        currentStep++;
        const currentProgress = Math.min(currentStep / totalSteps, 1); // Progress factor (0.0 to 1.0)

        // Calculate interpolated drone position
        const newDronePos = interpolateLatLng(storeLatLng, currentUserLocation, currentProgress);
        // UNCOMMENT for detailed step logging:
        // console.log(`Step: ${currentStep}/${Math.ceil(totalSteps)}, Progress: ${currentProgress.toFixed(3)}, Drone Pos: [${newDronePos[0].toFixed(4)}, ${newDronePos[1].toFixed(4)}]`);
        setDronePosition(newDronePos); // Update drone position state

        // Update progress bar state
        setProgress(currentProgress * 100);

        // Update estimated time remaining state
        setEstimatedTime(Math.max(0, DELIVERY_TIME_SECONDS * (1 - currentProgress)));

        // Check if animation is complete
        if (currentProgress >= 1) {
          console.log("Animation finished."); // Debug log
          if (intervalRef.current) clearInterval(intervalRef.current); // Stop the interval
          // Ensure drone position snaps exactly to the final user location
          setDronePosition([currentUserLocation.lat, currentUserLocation.lng]);
          setProgress(100);
          setEstimatedTime(0);
        }
      }, ANIMATION_INTERVAL_MS);

      // Cleanup function: Clear the interval when the component unmounts or dependencies change
      return () => {
        console.log("Cleaning up animation interval."); // Debug log
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else if (currentUserLocation && !(currentUserLocation instanceof L.LatLng)){
        // Log error if currentUserLocation is set but not a valid LatLng object
        console.error("currentUserLocation is not a valid L.LatLng object:", currentUserLocation); // Debug log
    }
    // Dependencies for this effect: It should re-run if user location changes *before* animation starts
  }, [currentUserLocation, animationStarted]); // storeLatLng is stable and defined outside, so not needed here

  // --- Render Logic ---

  // Show loading state while fetching location
  if (isLocating) {
    return (
      <div className="flex flex-col justify-center items-center h-80 md:h-96 py-10">
        <p className="text-lg font-medium">Fetching your location...</p>
        <p className="text-sm text-gray-500 mt-2">Please ensure location services are enabled.</p>
      </div>
    );
  }

  // Show error message if location fetching failed
  if (locationError) {
     return (
      <div className="flex flex-col justify-center items-center h-80 md:h-96 py-10 px-4 text-center">
         <p className="text-lg font-medium text-red-600">Error: {locationError}</p>
         <p className="text-sm text-gray-500 mt-2">Please check browser permissions and try again.</p>
     </div>
     );
  }

  // Calculate map center and initial zoom (adjust as needed)
   const mapCenter = currentUserLocation instanceof L.LatLng
     ? L.latLngBounds(storeLatLng, currentUserLocation).getCenter() // Center between store and user
     : storeLatLng; // Default to store if user location not yet available (shouldn't happen after loading/error checks)

   const mapInitialZoom = currentUserLocation instanceof L.LatLng ? 12 : 13; // Adjust zoom level

  // Render the main component with map and progress
  return (
    <div className="flex flex-col items-center justify-center w-full py-10">
      <h2 className="text-xl font-bold mb-6">Your Drone is on the way!</h2>

      {/* Map Container */}
      <div className="relative w-full h-80 md:h-96 bg-gray-200 rounded-lg mb-6 overflow-hidden border border-gray-300 shadow-md">
        <MapContainer
          key={currentUserLocation ? 'map-loaded' : 'map-loading'} // Force re-render slightly if needed, though MapBoundsAdjuster handles view
          center={mapCenter}
          zoom={mapInitialZoom}
          scrollWheelZoom={true} // Enable scroll wheel zoom
          style={{ height: '100%', width: '100%' }}
        >
          {/* OpenStreetMap Tile Layer */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Component to dynamically adjust map view */}
          <MapBoundsAdjuster storeLoc={STORE_COORDS} userLoc={currentUserLocation} />

          {/* Store Marker */}
          <Marker position={STORE_COORDS} icon={storeIcon}>
            <Popup>
              Store Location <br /> Pickup Point
            </Popup>
          </Marker>

          {/* Drop Off Marker (only render if location is valid) */}
          {currentUserLocation instanceof L.LatLng && (
            <Marker position={currentUserLocation} icon={dropOffIcon}>
              <Popup>
                Your Location <br /> Drop-off Point
              </Popup>
            </Marker>
          )}

          {/* Animated Drone Marker (only render if animation started and position exists) */}
          {dronePosition && animationStarted && (
             <Marker position={dronePosition} icon={droneIcon}>
                {/* Optional: Popup on the drone itself */}
                {/* <Popup>Drone en route</Popup> */}
             </Marker>
          )}

        </MapContainer>
      </div>

       {/* Progress Bar and Time */}
       <div className="w-full max-w-md px-4">
         <div className="flex justify-between text-sm mb-1 text-gray-600 font-medium">
           <span>Store</span>
           {/* Display 'In Transit' more dynamically based on progress */}
           <span className={`transition-opacity duration-300 ${progress > 5 && progress < 95 ? 'opacity-100' : 'opacity-50'}`}>
             In Transit
           </span>
           <span className={`transition-opacity duration-300 ${progress >= 100 ? 'opacity-100' : 'opacity-50'}`}>
               Delivered
           </span>
         </div>
         <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 overflow-hidden"> {/* Added overflow-hidden */}
           <div
             className="bg-blue-600 h-2.5 rounded-full transition-all duration-150 ease-linear" // Use CSS transition for smoother width change
             style={{ width: `${progress}%` }}
             aria-valuenow={progress}
             aria-valuemin={0}
             aria-valuemax={100}
             role="progressbar"
             aria-label="Delivery progress"
           ></div>
         </div>
         <p className="text-center text-gray-600 h-5"> {/* Added fixed height to prevent jump */}
           {progress >= 100
             ? "Drone has arrived!"
             : animationStarted
               ? `Estimated delivery in ${Math.max(0, Math.ceil(estimatedTime))} seconds`
               : "Waiting for location to start..."}
         </p>
       </div>
    </div>
  );
}

// Export the component for use (if not default export)
// export { DeliveryAnimation }; // Use this if it's not the default export of the file
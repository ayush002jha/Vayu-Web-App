// ShoppingCart.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import Image from "next/image";
import { Trash2, Minus, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const DynamicDeliveryAnimation = dynamic(
  () =>
    import("@/components/delivery-animation").then(
      (mod) => mod.DeliveryAnimation
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center h-96">
        <p>Loading map...</p>
      </div>
    ),
  }
);

interface CartItem {
  id: number;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

interface ShoppingCartProps {
  items: CartItem[];
  onIncrement: (id: number) => void;
  onDecrement: (id: number) => void;
}

export function ShoppingCart({
  items,
  onIncrement,
  onDecrement,
}: ShoppingCartProps) {
  const [checkoutStep, setCheckoutStep] = useState<
    "cart" | "delivery" | "completed"
  >("cart");
  const [orderError, setOrderError] = useState<string | null>(null);

  // Global altitude state
  const [altitude, setAltitude] = useState<number>(50);

  // NEW: WebSocket telemetry subscription for RTL detection
  const wsRef = useRef<WebSocket | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<string>("Preparing...");

  const totalPrice = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const deliveryFee = 49.99;

  // NEW: WebSocket telemetry listener for RTL completion
  useEffect(() => {
    if (checkoutStep !== "delivery") {
      // Clean up WebSocket when not in delivery mode
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    // Subscribe to telemetry when in delivery mode
    const ws = new WebSocket(
      "wss://famous-eternal-pipefish.ngrok-free.app/ws/telemetry"
    );
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("🔗 ShoppingCart: WebSocket connected for RTL monitoring");
      setDeliveryStatus("Connected to drone telemetry...");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Check for RTL status in telemetry
        if (data.rtl_status) {
          if (data.rtl_status.is_rtl_active) {
            setDeliveryStatus("🏠 Drone returning to launch...");
            console.log("🔄 ShoppingCart: RTL triggered, drone returning home");
            setDeliveryStatus("✅ Delivery completed!");
            setCheckoutStep("completed");
          }
        } else {
          // Update general delivery status from drone position/progress
          setDeliveryStatus("Mission in progress...");
        }
      } catch (e) {
        console.warn("Failed to parse telemetry message:", event.data);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setDeliveryStatus("Connection error");
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
    };

    // Cleanup function
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [checkoutStep]); // Re-run when checkout step changes

  const handleCheckout = async () => {
    setOrderError(null);

    if (!navigator.geolocation) {
      setOrderError("Geolocation is not supported by your browser.");
      return;
    }

    // 1) Resolve geolocation on button click
    let coords: GeolocationPosition["coords"];
    try {
      coords = await new Promise<GeolocationPosition["coords"]>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        }
      );
    } catch (err: any) {
      setOrderError(err?.message || "Could not fetch your location.");
      return;
    }

    // 2) Send correct JSON to FastAPI with global altitude
    try {
      const res = await fetch(
        "https://famous-eternal-pipefish.ngrok-free.app/trigger",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_lat: coords.latitude,
            target_lon: coords.longitude,
            altitude_m: altitude, // Use global altitude state
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Trigger failed: ${res.status} ${text}`);
      }
    } catch (err: any) {
      setOrderError(err?.message || "Failed to trigger mission.");
      return;
    }

    // 3) Switch to DeliveryAnimation screen (WebSocket will start automatically)
    setCheckoutStep("delivery");
  };

  // Dummy function for testing
  const handleTestDrone = async () => {
    setOrderError(null);

    // Hardcoded test coordinates with global altitude
    const testCoords = {
      target_lat: 47.396831,
      target_lon: 8.546584,
      altitude_m: altitude, // Use global altitude state
    };

    try {
      console.log("🧪 Testing with dummy coordinates:", testCoords);

      const res = await fetch(
        "https://famous-eternal-pipefish.ngrok-free.app/trigger",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testCoords),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Trigger failed: ${res.status} ${text}`);
      }

      const result = await res.json();
      console.log("✅ Test mission accepted:", result);

      setCheckoutStep("delivery");
    } catch (err: any) {
      setOrderError(err?.message || "Failed to trigger test mission.");
    }
  };

  if (checkoutStep === "delivery") {
    return (
      <div className="py-4">
        {/* NEW: Delivery status header with RTL monitoring */}
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-green-800">
              🚁 Delivery Status
            </h3>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  wsRef.current ? "bg-green-500" : "bg-red-500"
                } animate-pulse`}
              ></div>
              <span className="text-xs text-green-600">Live Tracking</span>
            </div>
          </div>
          <p className="text-sm text-green-700 font-medium">{deliveryStatus}</p>
        </div>

        <Suspense fallback={<p>Loading map...</p>}>
          <DynamicDeliveryAnimation />
        </Suspense>
      </div>
    );
  }

  if (checkoutStep === "completed") {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Delivery Completed!</h2>
        <p className="text-gray-500 mb-6">
          Your drone has successfully completed the delivery mission and
          returned home.
        </p>
        <Button
          onClick={() => {
            setCheckoutStep("cart");
            setDeliveryStatus("Preparing...");
          }}
        >
          Place New Order
        </Button>
      </div>
    );
  }

  return (
    <div className="py-4">
      <h2 className="text-xl font-bold mb-4">Your Cart</h2>

      {orderError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {orderError}
        </div>
      )}

      {/* Altitude Control Section */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-blue-800">
            🚁 Flight Altitude
          </h3>
          <span className="text-lg font-bold text-blue-600">{altitude}m</span>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={altitude}
            onChange={(e) => setAltitude(Number(e.target.value))}
            className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                ((altitude - 10) / 90) * 100
              }%, #dbeafe ${((altitude - 10) / 90) * 100}%, #dbeafe 100%)`,
            }}
          />

          <div className="flex justify-between text-xs text-blue-600">
            <span>10m</span>
            <span className="font-medium">Above Home Ground</span>
            <span>100m</span>
          </div>

          {/* Quick preset buttons */}
          <div className="flex gap-2 mt-2">
            {[20, 30, 50, 80].map((preset) => (
              <button
                key={preset}
                onClick={() => setAltitude(preset)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  altitude === preset
                    ? "bg-blue-500 text-white"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }`}
              >
                {preset}m
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Test button for development */}
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-sm text-yellow-800 mb-2">🧪 Testing Mode</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestDrone}
          className="w-full border-yellow-300 text-yellow-700 hover:bg-yellow-100"
        >
          Test Drone at {altitude}m Altitude
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">Your cart is empty</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
              >
                <div className="relative h-16 w-16 rounded-md overflow-hidden flex-shrink-0">
                  <Image
                    src={item.image || "/placeholder.svg"}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{item.name}</h3>
                  <p className="text-sm text-gray-500">
                    ₹{item.price.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-background rounded-md p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDecrement(item.id)}
                  >
                    {item.quantity === 1 ? (
                      <Trash2 className="h-4 w-4" />
                    ) : (
                      <Minus className="h-4 w-4" />
                    )}
                  </Button>
                  <span className="w-6 text-center font-medium">
                    {item.quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                    onClick={() => onIncrement(item.id)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Separator className="my-6" />
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{totalPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery Fee</span>
              <span>₹{deliveryFee.toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>₹{(totalPrice + deliveryFee).toFixed(2)}</span>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={items.length === 0}
            >
              Place Order (Flight at {altitude}m)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

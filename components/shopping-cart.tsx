"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Minus, Plus, Trash2 } from "lucide-react"
import { Separator } from "@/components/ui/separator"
// import { DeliveryAnimation } from "@/components/delivery-animation"
import dynamic from 'next/dynamic';
import { Suspense } from 'react'; // Optional but good for loading states

// With a dynamic import:
const DynamicDeliveryAnimation = dynamic(
  () => import('@/components/delivery-animation') // Adjust path to your component
    .then((mod) => mod.DeliveryAnimation), // Make sure to access the named export
  {
    ssr: false, // <--- This is the crucial part! Disables server-side rendering for this component
    loading: () => <div className="flex justify-center items-center h-96"><p>Loading map...</p></div> // Optional: Show a loading message
  }
);

interface CartItem {
  id: number
  name: string
  price: number
  image: string
  quantity: number
}

interface ShoppingCartProps {
  items: CartItem[]
  onIncrement: (id: number) => void
  onDecrement: (id: number) => void
  userCoordinates?: { latitude: number; longitude: number } | null;
}

async function triggerDrone(): Promise<void> {
  try {
    const response = await fetch('https://nearly-daring-gannet.ngrok-free.app:5000/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // If your endpoint expects a JSON body, include it here; otherwise, omit the body
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const result: { status: string } = await response.json();
    console.log('Drone triggered:', result);
  } catch (error) {
    console.error('Error triggering drone:', error);
  }
}
export function ShoppingCart({ items, onIncrement, onDecrement }: ShoppingCartProps) {
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "delivery" | "completed">("cart")

  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const deliveryFee = 49.99

  const handleCheckout = () => {

    setCheckoutStep("delivery")
    triggerDrone();

    // Simulate delivery completion after 10 seconds
    setTimeout(() => {
      setCheckoutStep("completed")
    }, 30000)
  }

  const handleNewOrder = () => {
    setCheckoutStep("cart")
  }

  if (checkoutStep === "delivery") {
    return (<Suspense fallback={<p>Loading map...</p>}>
      <DynamicDeliveryAnimation />
    </Suspense>)
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Delivery Completed!</h2>
        <p className="text-gray-500 mb-6">Your items have been delivered successfully.</p>
        <Button onClick={handleNewOrder}>Place New Order</Button>
      </div>
    )
  }



  return (
    <div className="py-4">
      <h2 className="text-xl font-bold mb-4">Your Cart</h2>
      {items.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">Your cart is empty</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="relative h-16 w-16 rounded-md overflow-hidden flex-shrink-0">
                  <Image src={item.image || "/placeholder.svg"} alt={item.name} fill className="object-cover" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{item.name}</h3>
                  <p className="text-sm text-gray-500">₹{item.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2 bg-background rounded-md p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDecrement(item.id)}
                  >
                    {item.quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  </Button>
                  <span className="w-6 text-center font-medium">{item.quantity}</span>
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
            <Button className="w-full" size="lg" onClick={() => { handleCheckout() }} disabled={items.length === 0}>
              Place Order
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

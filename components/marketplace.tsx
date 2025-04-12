"use client"

import { useState } from "react"
import { ProductCard } from "@/components/product-card"
import { ShoppingCart } from "@/components/shopping-cart"
import { NavBar } from "@/components/nav-bar"
import { Button } from "@/components/ui/button"
import { ShoppingBag } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { products } from "@/lib/data"

export function Marketplace() {
  const [cartItems, setCartItems] = useState<
    {
      id: number
      name: string
      price: number
      image: string
      quantity: number
    }[]
  >([])

  const addToCart = (productId: number, quantityChange: number) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return

    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.id === productId)
      if (existingItem) {
        const newQuantity = existingItem.quantity + quantityChange
        if (newQuantity <= 0) {
          return prevItems.filter((item) => item.id !== productId)
        }
        return prevItems.map((item) => (item.id === productId ? { ...item, quantity: newQuantity } : item))
      } else if (quantityChange > 0) {
        return [...prevItems, { ...product, quantity: quantityChange }]
      }
      return prevItems
    })
  }

  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      <main className="flex-1 container max-w-md mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Quick Drone Delivery</h1>
        <div className="grid grid-cols-2 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} onAddToCart={(quantity) => addToCart(product.id, quantity)} />
          ))}
        </div>
      </main>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="default" size="icon" className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg">
            <ShoppingBag className="h-6 w-6" />
            {cartItemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
                {cartItemCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
          <ScrollArea className="h-full pr-4">
            <ShoppingCart items={cartItems} onIncrement={(id) => addToCart(id, 1)} onDecrement={(id) => addToCart(id, -1)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
}

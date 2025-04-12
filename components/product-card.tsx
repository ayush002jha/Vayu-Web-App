"use client"

import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Plus, Minus } from "lucide-react"
import { useState } from "react"

interface Product {
  id: number
  name: string
  price: number
  image: string
  description: string
}

interface ProductCardProps {
  product: Product
  onAddToCart: (quantity: number) => void
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const [quantity, setQuantity] = useState(0)

  const handleIncrement = () => {
    setQuantity(prev => prev + 1)
    onAddToCart(1)
  }

  const handleDecrement = () => {
    if (quantity > 0) {
      setQuantity(prev => prev - 1)
      onAddToCart(-1)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative h-32">
        <Image src={product.image || "/placeholder.svg"} alt={product.name} fill className="object-cover" />
      </div>
      <CardContent className="p-3">
        <h3 className="font-medium text-sm line-clamp-1">{product.name}</h3>
        <p className="text-sm font-bold">₹{product.price.toFixed(2)}</p>
      </CardContent>
      <CardFooter className="p-2">
        {quantity === 0 ? (
          <Button onClick={handleIncrement} size="sm" className="w-full h-8" variant="default">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        ) : (
          <div className="flex items-center justify-between w-full h-8 bg-primary text-primary-foreground rounded-md">
            <Button
              onClick={handleDecrement}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-primary/80"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="font-medium">{quantity}</span>
            <Button
              onClick={handleIncrement}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-primary/80"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  )
}

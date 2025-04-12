import { Home, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"

export function NavBar() {
  return (
    <header className="sticky top-0 z-10 bg-white border-b">
      <div className="container max-w-md mx-auto px-4 h-14 flex items-center justify-between">
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="font-bold text-lg">VayuDelivery</h1>
        <Button variant="ghost" size="icon">
          <Home className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}

// =============================================================================
// WPW ShopFlow Dashboard - Customer Portal
// Powered by WrapCommandAI
// Replaces WePrintWraps.com account page
// =============================================================================

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Package, 
  Sparkles, 
  Trophy, 
  Gift,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  ShoppingBag,
  Palette,
  Vote,
  Star,
  Download,
  Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// =============================================================================
// BRAND COLORS - WePrintWraps + Neon Accent
// =============================================================================
const BRAND = {
  primary: "#e6007e", // WPW Pink
  gradient: "from-fuchsia-500 via-purple-500 to-blue-500",
  dark: "#0A0A1E",
  card: "rgba(15, 15, 35, 0.95)",
};

// =============================================================================
// MOCK DATA (Replace with real data)
// =============================================================================
const MOCK_DESIGNS = [
  { id: 1, name: "Midnight Carbon", category: "Racing", image: "https://images.unsplash.com/photo-1619405399517-d7fce0f13302?w=400", price: 299 },
  { id: 2, name: "Neon Surge", category: "Abstract", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400", price: 349 },
  { id: 3, name: "Urban Camo", category: "Camo", image: "https://images.unsplash.com/photo-1549399542-7e8ee8c3e6a0?w=400", price: 279 },
  { id: 4, name: "Chrome Wave", category: "Geometric", image: "https://images.unsplash.com/photo-1550355291-bbee04a92027?w=400", price: 399 },
  { id: 5, name: "Sakura Dreams", category: "Japanese", image: "https://images.unsplash.com/photo-1552642762-f55d06580015?w=400", price: 329 },
];

const MOCK_WOTW_NOMINEES = [
  { id: 1, name: "Ghost Rider GTR", artist: "@carbon_kings", image: "https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?w=400", votes: 234 },
  { id: 2, name: "Electric Blue M4", artist: "@wrap_wizard", image: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=400", votes: 189 },
  { id: 3, name: "Sunset Porsche", artist: "@vinyl_vision", image: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=400", votes: 156 },
];

const MOCK_MONTHLY_DROP = {
  month: "February 2026",
  name: "Velocity Pack",
  designs: 5,
  description: "Racing-inspired designs for speed enthusiasts",
  available: true,
};

// =============================================================================
// COMPONENTS
// =============================================================================

// Design Carousel
const DesignCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const next = () => setCurrentIndex((i) => (i + 1) % MOCK_DESIGNS.length);
  const prev = () => setCurrentIndex((i) => (i - 1 + MOCK_DESIGNS.length) % MOCK_DESIGNS.length);
  
  return (
    <Card className="bg-[#0A0A1E] border-fuchsia-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Palette className="w-5 h-5 text-fuchsia-400" />
            Design Vault
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-fuchsia-400 hover:text-fuchsia-300">
            View All <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Carousel */}
          <div className="flex gap-4 overflow-hidden">
            {MOCK_DESIGNS.map((design, idx) => (
              <div 
                key={design.id}
                className={`flex-shrink-0 w-48 transition-all duration-300 ${
                  idx === currentIndex ? 'opacity-100 scale-100' : 'opacity-50 scale-95'
                }`}
                style={{ transform: `translateX(-${currentIndex * 208}px)` }}
              >
                <div className="relative group cursor-pointer">
                  <img 
                    src={design.image} 
                    alt={design.name}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                    <div>
                      <p className="text-white font-medium text-sm">{design.name}</p>
                      <p className="text-fuchsia-400 text-xs">${design.price}</p>
                    </div>
                  </div>
                  <Badge className="absolute top-2 right-2 bg-fuchsia-500/80 text-white text-xs">
                    {design.category}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          
          {/* Nav Buttons */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
            onClick={prev}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
            onClick={next}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
        
        {/* CTA */}
        <div className="mt-4 flex gap-2">
          <Button className="flex-1 bg-gradient-to-r from-fuchsia-500 to-purple-500 hover:from-fuchsia-600 hover:to-purple-600">
            <ShoppingBag className="w-4 h-4 mr-2" />
            Shop Designs
          </Button>
          <Button variant="outline" className="border-fuchsia-500/50 text-fuchsia-400 hover:bg-fuchsia-500/10">
            <Eye className="w-4 h-4 mr-2" />
            Preview on Vehicle
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ClubWPW Monthly Drop
const ClubWPWSection = () => {
  return (
    <Card className="bg-[#0A0A1E] border-fuchsia-500/30 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 via-transparent to-purple-500/10" />
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-400" />
            <span>Club<span className="bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">WPW</span></span>
          </CardTitle>
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
            Monthly Drop
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="relative">
        {/* Monthly Drop Card */}
        <div className="bg-gradient-to-br from-fuchsia-900/50 to-purple-900/50 rounded-xl p-4 border border-fuchsia-500/30">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-fuchsia-300 text-sm">{MOCK_MONTHLY_DROP.month}</p>
              <h3 className="text-white text-xl font-bold">{MOCK_MONTHLY_DROP.name}</h3>
              <p className="text-gray-400 text-sm mt-1">{MOCK_MONTHLY_DROP.description}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white">{MOCK_MONTHLY_DROP.designs}</p>
              <p className="text-fuchsia-400 text-xs">FREE Designs</p>
            </div>
          </div>
          
          <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold">
            <Download className="w-4 h-4 mr-2" />
            Claim Your Free Designs
          </Button>
          
          <p className="text-center text-gray-500 text-xs mt-2">
            Available for ClubWPW members only
          </p>
        </div>
        
        {/* Membership CTA */}
        <div className="mt-4 p-3 bg-black/30 rounded-lg border border-white/10">
          <p className="text-gray-400 text-sm text-center">
            Not a member? <a href="#" className="text-fuchsia-400 hover:underline">Join ClubWPW</a> — it's free!
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

// Wrap of the Week Voting
const WOTWVoting = () => {
  const [votedFor, setVotedFor] = useState<number | null>(null);
  
  const handleVote = (id: number) => {
    setVotedFor(id);
    // TODO: Submit vote to backend
  };
  
  return (
    <Card className="bg-[#0A0A1E] border-fuchsia-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Wrap of the Week
          </CardTitle>
          <Badge variant="outline" className="border-amber-500/50 text-amber-400">
            <Vote className="w-3 h-3 mr-1" />
            Vote Now
          </Badge>
        </div>
        <p className="text-gray-400 text-sm">Vote for your favorite wrap!</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {MOCK_WOTW_NOMINEES.map((nominee) => (
            <div 
              key={nominee.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                votedFor === nominee.id 
                  ? 'border-amber-500 bg-amber-500/10' 
                  : 'border-white/10 hover:border-fuchsia-500/50 bg-black/30'
              }`}
              onClick={() => handleVote(nominee.id)}
            >
              <img 
                src={nominee.image} 
                alt={nominee.name}
                className="w-16 h-16 object-cover rounded-lg"
              />
              <div className="flex-1">
                <p className="text-white font-medium">{nominee.name}</p>
                <p className="text-fuchsia-400 text-sm">{nominee.artist}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">{nominee.votes + (votedFor === nominee.id ? 1 : 0)}</p>
                <p className="text-gray-500 text-xs">votes</p>
              </div>
              {votedFor === nominee.id && (
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              )}
            </div>
          ))}
        </div>
        
        <Button variant="outline" className="w-full mt-4 border-fuchsia-500/50 text-fuchsia-400 hover:bg-fuchsia-500/10">
          View All Nominees & Past Winners
          <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
};

// RestyleProAI Promo
const RestyleProAIPromo = () => {
  return (
    <Card className="bg-gradient-to-br from-cyan-900/50 to-blue-900/50 border-cyan-500/30">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold">See it before you wrap it</h3>
            <p className="text-cyan-300 text-sm">Preview any design on YOUR vehicle with RestyleProAI</p>
          </div>
          <Button className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600">
            Try Free
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Order Tracking Quick View
const OrderTracking = () => {
  return (
    <Card className="bg-[#0A0A1E] border-fuchsia-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-fuchsia-400" />
            My Orders
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-fuchsia-400 hover:text-fuchsia-300">
            View All <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No orders yet</p>
          <Button className="mt-3 bg-gradient-to-r from-fuchsia-500 to-purple-500">
            Start Shopping
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// =============================================================================
// MAIN DASHBOARD
// =============================================================================
export default function WPWDashboard() {
  return (
    <div className="min-h-screen bg-[#050510]">
      {/* Header */}
      <header className="border-b border-fuchsia-500/20 bg-[#0A0A1E]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="https://weprintwraps.com/wp-content/uploads/2023/01/wpw-logo.png" 
                alt="We Print Wraps" 
                className="h-8"
                onError={(e) => {
                  e.currentTarget.src = '';
                  e.currentTarget.alt = 'WPW';
                }}
              />
              <div>
                <h1 className="text-white font-bold">ShopFlow Dashboard</h1>
                <p className="text-gray-500 text-xs">Powered by WrapCommandAI</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="border-fuchsia-500/50 text-fuchsia-400 hover:bg-fuchsia-500/10">
                My Account
              </Button>
              <Button className="bg-gradient-to-r from-fuchsia-500 to-purple-500">
                Shop Now
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Welcome */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">Welcome back! 👋</h2>
          <p className="text-gray-400">Explore designs, vote for your favorites, and track your orders.</p>
        </div>
        
        {/* RestyleProAI Promo */}
        <div className="mb-6">
          <RestyleProAIPromo />
        </div>
        
        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Designs & ClubWPW */}
          <div className="lg:col-span-2 space-y-6">
            <DesignCarousel />
            <ClubWPWSection />
          </div>
          
          {/* Right Column - WOTW & Orders */}
          <div className="space-y-6">
            <WOTWVoting />
            <OrderTracking />
          </div>
        </div>
        
        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-white/10 text-center">
          <p className="text-gray-500 text-sm">
            © 2026 We Print Wraps • 
            <a href="https://weprintwraps.com" className="text-fuchsia-400 hover:underline ml-1">weprintwraps.com</a>
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Dashboard powered by <a href="https://wrapcommandai.com" className="text-fuchsia-400 hover:underline">WrapCommandAI</a>
          </p>
        </footer>
      </main>
    </div>
  );
}

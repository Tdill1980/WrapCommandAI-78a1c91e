/**
 * WPW Customer Dashboard
 * 
 * Customer-facing dashboard for WePrintWraps.com
 * Intended to be served via subdomain: my.weprintwraps.com
 * 
 * Features:
 * - Order lookup and tracking
 * - Recent orders (if email provided)
 * - ClubWPW preview (monthly drops, WOTW)
 * - Featured designs carousel
 * - RestyleProAI CTA for color visualization
 * 
 * ⚠️ DO NOT DEPLOY - Awaiting Trish review
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, Package, Truck, Clock, CheckCircle2, ChevronRight, 
  Palette, Crown, Trophy, Download, ExternalLink, ArrowRight,
  Sparkles, Mail, Phone
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Neon gradient colors (matching ShopFlow 2.0)
const NEON_GRADIENT = "from-[#FF00FF] via-[#9D4EDD] to-[#2F81F7]";
const MAGENTA = "#E91E8C";
const CYAN = "#15D1FF";

// Stage display config
const STAGE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  'order_received': { label: 'Order Received', icon: <Package className="w-4 h-4" />, color: 'text-blue-400' },
  'artwork_review': { label: 'Art Review', icon: <Palette className="w-4 h-4" />, color: 'text-purple-400' },
  'in_production': { label: 'In Production', icon: <Clock className="w-4 h-4" />, color: 'text-yellow-400' },
  'quality_check': { label: 'Quality Check', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-green-400' },
  'shipped': { label: 'Shipped', icon: <Truck className="w-4 h-4" />, color: 'text-cyan-400' },
  'delivered': { label: 'Delivered', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400' },
};

interface RecentOrder {
  id: string;
  order_number: string;
  customer_name: string;
  current_stage: string;
  total_amount: number;
  created_at: string;
}

interface FeaturedDesign {
  id: string;
  color_name: string;
  vehicle_make: string;
  vehicle_model: string;
  render_urls: Record<string, string>;
  finish_type: string;
}

export default function WPWCustomerDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // State
  const [orderNumber, setOrderNumber] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [featuredDesigns, setFeaturedDesigns] = useState<FeaturedDesign[]>([]);
  const [loading, setLoading] = useState(false);
  const [emailLookupDone, setEmailLookupDone] = useState(false);

  // Check for order in URL
  useEffect(() => {
    const orderParam = searchParams.get('order');
    if (orderParam) {
      navigate(`/track/${orderParam}`, { replace: true });
    }
  }, [searchParams, navigate]);

  // Fetch featured designs on mount
  useEffect(() => {
    fetchFeaturedDesigns();
  }, []);

  const fetchFeaturedDesigns = async () => {
    try {
      const { data } = await supabase
        .from('color_visualizations')
        .select('id, color_name, vehicle_make, vehicle_model, render_urls, finish_type')
        .order('created_at', { ascending: false })
        .limit(6);
      
      if (data) {
        setFeaturedDesigns(data);
      }
    } catch (err) {
      console.error('Error fetching designs:', err);
    }
  };

  const handleOrderLookup = () => {
    const trimmed = orderNumber.trim();
    if (trimmed) {
      navigate(`/track/${trimmed}`);
    }
  };

  const handleEmailLookup = async () => {
    if (!customerEmail.trim()) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shopflow_orders')
        .select('id, order_number, customer_name, current_stage, total_amount, created_at')
        .ilike('customer_email', customerEmail.trim())
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      setRecentOrders(data || []);
      setEmailLookupDone(true);
    } catch (err) {
      console.error('Error looking up orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0D0D0D] via-[#111111] to-[#0D0D0D]">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="https://weprintwraps.com/wp-content/uploads/2023/03/WPW-Horizontal-Logo-2023.png" 
              alt="WePrintWraps" 
              className="h-10 object-contain"
            />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="tel:+14806499209" className="flex items-center gap-2 text-muted-foreground hover:text-white transition">
              <Phone className="w-4 h-4" />
              <span className="hidden sm:inline">(480) 649-9209</span>
            </a>
            <a href="mailto:hello@weprintwraps.com" className="flex items-center gap-2 text-muted-foreground hover:text-white transition">
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">Contact Us</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Hero Section */}
        <section className="text-center py-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 font-['Poppins']">
            <span className="text-white">My </span>
            <span className={`bg-gradient-to-r ${NEON_GRADIENT} bg-clip-text text-transparent`}>Account</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Track your orders, access exclusive designs, and explore the world of premium vehicle wraps
          </p>
        </section>

        {/* Order Lookup */}
        <Card className="p-6 bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10">
          <Tabs defaultValue="order" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
              <TabsTrigger value="order">Track by Order #</TabsTrigger>
              <TabsTrigger value="email">Find My Orders</TabsTrigger>
            </TabsList>
            
            <TabsContent value="order" className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
                <Input
                  type="text"
                  placeholder="Enter Order Number (e.g., 33223)"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleOrderLookup()}
                  className="text-lg h-12 bg-black/30 border-white/20"
                />
                <Button 
                  onClick={handleOrderLookup} 
                  size="lg" 
                  className={`px-8 bg-gradient-to-r ${NEON_GRADIENT} hover:opacity-90`}
                >
                  <Search className="w-5 h-5 mr-2" />
                  Track
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Your order number is in your confirmation email
              </p>
            </TabsContent>
            
            <TabsContent value="email" className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleEmailLookup()}
                  className="text-lg h-12 bg-black/30 border-white/20"
                />
                <Button 
                  onClick={handleEmailLookup} 
                  size="lg" 
                  disabled={loading}
                  className={`px-8 bg-gradient-to-r ${NEON_GRADIENT} hover:opacity-90`}
                >
                  {loading ? 'Searching...' : 'Find Orders'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Recent Orders Results */}
          {emailLookupDone && (
            <div className="mt-6 pt-6 border-t border-white/10">
              {recentOrders.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Your Recent Orders</h3>
                  {recentOrders.map((order) => {
                    const stage = STAGE_CONFIG[order.current_stage] || STAGE_CONFIG['order_received'];
                    return (
                      <button
                        key={order.id}
                        onClick={() => navigate(`/track/${order.order_number}`)}
                        className="w-full flex items-center justify-between p-4 rounded-lg bg-black/30 hover:bg-black/50 border border-white/10 hover:border-white/20 transition group"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`${stage.color}`}>{stage.icon}</div>
                          <div className="text-left">
                            <p className="font-medium">Order #{order.order_number}</p>
                            <p className="text-sm text-muted-foreground">{formatDate(order.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline" className={stage.color}>
                            {stage.label}
                          </Badge>
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-white transition" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No orders found for this email address
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Two Column Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* ClubWPW Preview */}
          <Card className="p-6 bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#FF00FF]/20 to-transparent rounded-bl-full" />
            
            <div className="flex items-center gap-3 mb-4">
              <Crown className="w-6 h-6 text-[#FFD700]" />
              <h2 className="text-xl font-bold">Club<span className="text-[#E91E8C]">WPW</span></h2>
              <Badge className="bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black text-xs">FREE</Badge>
            </div>
            
            <p className="text-muted-foreground mb-4">
              Exclusive monthly design drops, Wrap of the Week voting, and member-only perks
            </p>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-sm">
                <Download className="w-4 h-4 text-[#15D1FF]" />
                <span>Monthly print-ready design packs</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Trophy className="w-4 h-4 text-[#FFD700]" />
                <span>Vote for Wrap of the Week</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Sparkles className="w-4 h-4 text-[#E91E8C]" />
                <span>Early access to new products</span>
              </div>
            </div>
            
            <Button 
              onClick={() => navigate('/wrap-of-the-week')}
              className="w-full bg-gradient-to-r from-[#E91E8C] to-[#9D4EDD] hover:opacity-90"
            >
              Explore ClubWPW
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Card>

          {/* RestyleProAI CTA */}
          <Card className="p-6 bg-gradient-to-br from-[#16213e]/80 to-[#1a1a2e]/80 border-white/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#2F81F7]/20 to-transparent rounded-bl-full" />
            
            <div className="flex items-center gap-3 mb-4">
              <Palette className="w-6 h-6 text-[#2F81F7]" />
              <h2 className="text-xl font-bold">
                <span className="text-white">Restyle</span>
                <span className="text-[#2F81F7]">Pro</span>
                <span className="text-[#E91E8C]">AI</span>
              </h2>
            </div>
            
            <p className="text-muted-foreground mb-4">
              See your vehicle in any color before you buy. AI-powered 3D visualization in seconds.
            </p>
            
            <div className="aspect-video bg-gradient-to-br from-[#2F81F7]/10 to-[#E91E8C]/10 rounded-lg mb-4 flex items-center justify-center border border-white/10">
              <div className="text-center">
                <Sparkles className="w-12 h-12 text-[#2F81F7] mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">3D Wrap Visualization</p>
              </div>
            </div>
            
            <Button 
              onClick={() => window.open('https://restyleproai.com', '_blank')}
              variant="outline"
              className="w-full border-[#2F81F7] text-[#2F81F7] hover:bg-[#2F81F7]/10"
            >
              Try RestyleProAI
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </Card>
        </div>

        {/* Featured Designs */}
        {featuredDesigns.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                <span className="text-white">Featured </span>
                <span className={`bg-gradient-to-r ${NEON_GRADIENT} bg-clip-text text-transparent`}>Designs</span>
              </h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/design-shop')}
                className="text-muted-foreground hover:text-white"
              >
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {featuredDesigns.map((design) => {
                const imageUrl = design.render_urls?.hero || Object.values(design.render_urls || {})[0];
                return (
                  <Card 
                    key={design.id}
                    className="group overflow-hidden bg-black/30 border-white/10 hover:border-white/30 transition cursor-pointer"
                    onClick={() => navigate('/design-shop')}
                  >
                    <div className="aspect-square bg-gradient-to-br from-[#1a1a2e] to-[#16213e] relative">
                      {imageUrl ? (
                        <img 
                          src={imageUrl} 
                          alt={design.color_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Palette className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium truncate">{design.color_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {design.vehicle_make} {design.vehicle_model}
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Quick Links */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickLink 
            href="https://weprintwraps.com/shop" 
            icon={<Package className="w-5 h-5" />}
            label="Shop Products"
          />
          <QuickLink 
            href="https://weprintwraps.com/wrap-calculator" 
            icon={<Palette className="w-5 h-5" />}
            label="Wrap Calculator"
          />
          <QuickLink 
            href="https://weprintwraps.com/resources" 
            icon={<Download className="w-5 h-5" />}
            label="Resources"
          />
          <QuickLink 
            href="https://weprintwraps.com/contact" 
            icon={<Mail className="w-5 h-5" />}
            label="Contact Us"
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12 py-8 bg-black/30">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} WePrintWraps. All rights reserved.</p>
          <p className="mt-2">
            Premium vehicle wrap printing • Made in USA • 
            <a href="https://weprintwraps.com" className="text-[#2F81F7] hover:underline ml-1">
              weprintwraps.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

// Quick Link Component
function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 rounded-lg bg-black/30 border border-white/10 hover:border-white/20 hover:bg-black/50 transition group"
    >
      <span className="text-muted-foreground group-hover:text-[#2F81F7] transition">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </a>
  );
}

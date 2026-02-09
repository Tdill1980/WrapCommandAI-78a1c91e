/**
 * WPW ShopFlow Account Dashboard
 * Version: 2.1.0 - Feb 9, 2026 (cache bust)
 * 
 * Professional customer dashboard powered by WrapCommandAI
 * Features modern dashboard layout with sidebar navigation
 * 
 * Features:
 * - Professional dashboard interface
 * - Order management and tracking  
 * - Design Vault browsing and purchasing
 * - Account management
 * - Monthly drops and exclusive content
 * - Instagram-style gradients and modern design
 * - Wrap of the Week integration
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, Package, Truck, Clock, CheckCircle2, ChevronRight, 
  Palette, Crown, Trophy, Download, ExternalLink, ArrowRight,
  Sparkles, Mail, Phone, LayoutDashboard, ShoppingBag, User,
  CreditCard, Settings, LogOut, Plus, TrendingUp, Star,
  Calendar, Image, Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Instagram-style gradient colors
const INSTAGRAM_GRADIENT = "from-[#833ab4] via-[#fd1d1d] via-[#fcb045] to-[#ffdc80]";
const NEON_GRADIENT = "from-[#FF00FF] via-[#9D4EDD] to-[#2F81F7]";
const COOL_GRADIENT = "from-[#667eea] to-[#764ba2]";

// Stage display config
const STAGE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  'order_received': { label: 'Order Received', icon: <Package className="w-4 h-4" />, color: 'text-blue-400' },
  'artwork_review': { label: 'Art Review', icon: <Palette className="w-4 h-4" />, color: 'text-purple-400' },
  'in_production': { label: 'In Production', icon: <Clock className="w-4 h-4" />, color: 'text-yellow-400' },
  'quality_check': { label: 'Quality Check', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-green-400' },
  'shipped': { label: 'Shipped', icon: <Truck className="w-4 h-4" />, color: 'text-cyan-400' },
  'delivered': { label: 'Delivered', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400' },
};

// Sidebar navigation items
const SIDEBAR_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'orders', label: 'Orders', icon: <Package className="w-5 h-5" /> },
  { id: 'designs', label: 'Design Vault', icon: <Palette className="w-5 h-5" /> },
  { id: 'drops', label: 'Monthly Drops', icon: <Calendar className="w-5 h-5" /> },
  { id: 'wotw', label: 'Wrap of the Week', icon: <Trophy className="w-5 h-5" /> },
  { id: 'account', label: 'Account', icon: <User className="w-5 h-5" /> },
];

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
  const [activeTab, setActiveTab] = useState("dashboard");
  const [orderNumber, setOrderNumber] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [featuredDesigns, setFeaturedDesigns] = useState<FeaturedDesign[]>([]);
  const [loading, setLoading] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = 'WPW ShopFlow Account | WePrintWraps';
    return () => {
      document.title = 'WrapCommand | Professional Wrap Design SaaS Platform';
    };
  }, []);

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
    if (orderNumber.trim()) {
      navigate(`/track/${orderNumber.trim()}`);
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D0D0D] via-[#111111] to-[#0D0D0D]">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-black/50 backdrop-blur-sm border-r border-white/10 min-h-screen">
          {/* Logo */}
          <div className="p-6 border-b border-white/10">
            <div className="space-y-2">
              <img 
                src="https://weprintwraps.com/wp-content/uploads/2023/03/WPW-Horizontal-Logo-2023.png" 
                alt="WePrintWraps" 
                className="h-6 object-contain"
              />
              <div className="text-center">
                <p className="text-[#2F81F7] text-xs font-semibold">ShopFlow Account</p>
                <p className="text-gray-400 text-[10px]">powered by WrapCommandAI</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-2">
            {SIDEBAR_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  activeTab === item.id 
                    ? 'bg-gradient-to-r from-[#9D4EDD] to-[#2F81F7] text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* User section */}
          <div className="absolute bottom-0 w-64 p-4 border-t border-white/10">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#9D4EDD] to-[#2F81F7] flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">Customer</p>
                <p className="text-gray-400 text-sm">ShopFlow Account</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {/* Header */}
          <header className="border-b border-white/10 bg-black/30 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">
                  <span className="text-white">
                    {activeTab === 'dashboard' && 'Dashboard'}
                    {activeTab === 'orders' && 'Orders'}
                    {activeTab === 'designs' && 'Design Vault'}
                    {activeTab === 'drops' && 'Monthly Drops'}
                    {activeTab === 'wotw' && 'Wrap of the Week'}
                    {activeTab === 'account' && 'Account Settings'}
                  </span>
                </h1>
                <p className="text-gray-400 mt-1">
                  {activeTab === 'dashboard' && 'Welcome to your WPW ShopFlow Account'}
                  {activeTab === 'orders' && 'Track and manage your orders'}
                  {activeTab === 'designs' && 'Explore our premium design collection'}
                  {activeTab === 'drops' && 'Exclusive monthly releases and content'}
                  {activeTab === 'wotw' && 'Vote for the best wraps and win prizes'}
                  {activeTab === 'account' && 'Manage your account preferences'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <a href="tel:+14806499209" className="flex items-center gap-2 text-gray-400 hover:text-white transition">
                  <Phone className="w-4 h-4" />
                  <span className="hidden sm:inline">(480) 649-9209</span>
                </a>
              </div>
            </div>
          </header>

          {/* Content Area */}
          <main className="p-6">
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="bg-gradient-to-br from-[#16213e]/80 to-[#1a1a2e]/80 border-white/10">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-gradient-to-r from-[#2F81F7]/20 to-[#9D4EDD]/20">
                          <Package className="w-6 h-6 text-[#2F81F7]" />
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">Total Orders</p>
                          <p className="text-2xl font-bold text-white">{recentOrders.length}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-[#16213e]/80 to-[#1a1a2e]/80 border-white/10">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-gradient-to-r from-[#E91E8C]/20 to-[#9D4EDD]/20">
                          <Star className="w-6 h-6 text-[#E91E8C]" />
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">Saved Designs</p>
                          <p className="text-2xl font-bold text-white">12</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-[#16213e]/80 to-[#1a1a2e]/80 border-white/10">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-gradient-to-r from-[#00D4FF]/20 to-[#2F81F7]/20">
                          <Trophy className="w-6 h-6 text-[#00D4FF]" />
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">ClubWPW Status</p>
                          <p className="text-2xl font-bold text-white">Member</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Order Lookup */}
                  <Card className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10">
                    <CardHeader>
                      <CardTitle className="text-white">Quick Order Lookup</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-3">
                        <Input
                          type="text"
                          placeholder="Enter Order Number"
                          value={orderNumber}
                          onChange={(e) => setOrderNumber(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleOrderLookup()}
                          className="bg-black/30 border-white/20 text-white"
                        />
                        <Button 
                          onClick={handleOrderLookup} 
                          className="bg-gradient-to-r from-[#9D4EDD] to-[#2F81F7] hover:opacity-90"
                        >
                          <Search className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Design Vault Promo */}
                  <Card className="bg-gradient-to-br from-[#E91E8C]/10 to-[#9D4EDD]/10 border-[#E91E8C]/20 relative overflow-hidden">
                    <div className={`absolute inset-0 bg-gradient-to-r ${INSTAGRAM_GRADIENT} opacity-5`} />
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#E91E8C]" />
                        Design Vault
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-300 mb-4">Discover premium wrap designs from top creators worldwide.</p>
                      <Button 
                        onClick={() => setActiveTab('designs')}
                        className={`bg-gradient-to-r ${INSTAGRAM_GRADIENT} hover:opacity-90 text-white`}
                      >
                        Explore Designs
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === 'designs' && (
              <div className="space-y-6">
                {/* Design Categories */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    { title: "Latest Drops", count: "24 designs", color: "from-[#FF6B6B] to-[#4ECDC4]", icon: <Zap className="w-6 h-6" /> },
                    { title: "Trending", count: "18 designs", color: "from-[#A8E6CF] to-[#88D8C0]", icon: <TrendingUp className="w-6 h-6" /> },
                    { title: "Premium", count: "12 designs", color: "from-[#FFD93D] to-[#FF6B6B]", icon: <Crown className="w-6 h-6" /> },
                  ].map((category) => (
                    <Card key={category.title} className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10 hover:border-white/20 transition cursor-pointer group">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-full bg-gradient-to-r ${category.color} bg-opacity-20`}>
                            {category.icon}
                          </div>
                          <div>
                            <h3 className="text-white font-semibold group-hover:text-[#E91E8C] transition">{category.title}</h3>
                            <p className="text-gray-400 text-sm">{category.count}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Featured Designs Grid */}
                <div>
                  <h2 className="text-xl font-bold text-white mb-4">Featured Designs</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {featuredDesigns.map((design) => {
                      const imageUrl = design.render_urls?.hero || Object.values(design.render_urls || {})[0];
                      return (
                        <Card 
                          key={design.id}
                          className="group overflow-hidden bg-black/30 border-white/10 hover:border-[#E91E8C]/50 transition cursor-pointer"
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
                                <Image className="w-8 h-8 text-gray-400" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="absolute bottom-2 left-2 right-2">
                                <p className="text-white text-xs font-medium truncate">{design.color_name}</p>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'orders' && (
              <div className="space-y-6">
                {/* Email Lookup */}
                <Card className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Find My Orders</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-3">
                      <Input
                        type="email"
                        placeholder="Enter your email address"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleEmailLookup()}
                        className="bg-black/30 border-white/20 text-white"
                      />
                      <Button 
                        onClick={handleEmailLookup}
                        disabled={loading}
                        className="bg-gradient-to-r from-[#9D4EDD] to-[#2F81F7] hover:opacity-90"
                      >
                        {loading ? 'Searching...' : 'Find Orders'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Orders Table */}
                {recentOrders.length > 0 && (
                  <Card className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10">
                    <CardHeader>
                      <CardTitle className="text-white">Your Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {recentOrders.map((order) => {
                          const stage = STAGE_CONFIG[order.current_stage] || STAGE_CONFIG.order_received;
                          return (
                            <div 
                              key={order.id}
                              className="flex items-center justify-between p-4 rounded-lg bg-black/30 border border-white/10 hover:border-white/20 transition cursor-pointer"
                              onClick={() => navigate(`/track/${order.order_number}`)}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-full ${stage.color}`}>
                                  {stage.icon}
                                </div>
                                <div>
                                  <p className="text-white font-medium">Order #{order.order_number}</p>
                                  <p className="text-gray-400 text-sm">{formatDate(order.created_at)}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-white font-medium">{formatCurrency(order.total_amount)}</p>
                                <Badge className={`${stage.color} bg-opacity-20`}>
                                  {stage.label}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {activeTab === 'drops' && (
              <div className="space-y-6">
                <Card className={`bg-gradient-to-br from-[#E91E8C]/10 to-[#9D4EDD]/10 border-[#E91E8C]/20 relative overflow-hidden`}>
                  <div className={`absolute inset-0 bg-gradient-to-r ${INSTAGRAM_GRADIENT} opacity-5`} />
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Crown className="w-6 h-6 text-[#E91E8C]" />
                      ClubWPW Monthly Drops
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-300 mb-6">Exclusive monthly releases featuring limited-edition designs, early access to new products, and premium content.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">February 2026 Drop</h3>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-gray-300">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            <span>5 Exclusive Design Templates</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-300">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            <span>Early RestyleProAI Access</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-300">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            <span>Member-Only Pricing</span>
                          </div>
                        </div>
                      </div>
                      <div className="aspect-video bg-gradient-to-br from-[#2F81F7]/10 to-[#E91E8C]/10 rounded-lg flex items-center justify-center border border-white/10">
                        <div className="text-center">
                          <Calendar className="w-12 h-12 text-[#E91E8C] mx-auto mb-2" />
                          <p className="text-gray-300">February Drop Preview</p>
                        </div>
                      </div>
                    </div>
                    <Button 
                      className={`mt-6 bg-gradient-to-r ${INSTAGRAM_GRADIENT} hover:opacity-90 text-white`}
                      onClick={() => navigate('/wrap-of-the-week')}
                    >
                      View Current Drop
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'wotw' && (
              <div className="space-y-6">
                {/* Hero Banner */}
                <Card className={`bg-gradient-to-r ${NEON_GRADIENT} border-0 overflow-hidden`}>
                  <CardContent className="p-8 text-center">
                    <Trophy className="w-16 h-16 mx-auto mb-4 text-yellow-300" />
                    <h2 className="text-3xl font-bold text-white mb-2">Wrap of the Week</h2>
                    <p className="text-white/80 text-lg mb-6">Vote for the best wraps and compete for the SEMA "Paint is Dead" Wrap of the Year!</p>
                    <Button 
                      size="lg"
                      className="bg-white text-purple-600 hover:bg-white/90"
                      onClick={() => navigate('/wrap-of-the-week')}
                    >
                      <Trophy className="w-5 h-5 mr-2" />
                      Enter the Competition
                    </Button>
                  </CardContent>
                </Card>

                {/* Features Grid */}
                <div className="grid md:grid-cols-3 gap-4">
                  <Card className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10">
                    <CardContent className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                        <Star className="w-6 h-6 text-yellow-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">Weekly Voting</h3>
                      <p className="text-gray-400 text-sm">Vote for your favorite wraps every week</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10">
                    <CardContent className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                        <Crown className="w-6 h-6 text-purple-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">Win Prizes</h3>
                      <p className="text-gray-400 text-sm">Monthly winners get featured + prizes</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10">
                    <CardContent className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center mx-auto mb-4">
                        <Zap className="w-6 h-6 text-cyan-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">SEMA Show</h3>
                      <p className="text-gray-400 text-sm">Compete for Wrap of the Year at SEMA</p>
                    </CardContent>
                  </Card>
                </div>

                {/* CTA */}
                <Card className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white">Ready to Submit Your Wrap?</h3>
                      <p className="text-gray-400">Show off your work and get recognized by the community</p>
                    </div>
                    <Button 
                      className={`bg-gradient-to-r ${INSTAGRAM_GRADIENT} hover:opacity-90`}
                      onClick={() => navigate('/wrap-of-the-week')}
                    >
                      Submit Now
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6">
                <Card className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#16213e]/80 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Account Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-300">Account management features coming soon. For now, contact us for any account updates.</p>
                    <div className="flex gap-4 mt-6">
                      <Button variant="outline" className="border-white/20 text-white hover:bg-white/5">
                        <Mail className="w-4 h-4 mr-2" />
                        Contact Support
                      </Button>
                      <Button variant="outline" className="border-white/20 text-white hover:bg-white/5">
                        <Phone className="w-4 h-4 mr-2" />
                        Call (480) 649-9209
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
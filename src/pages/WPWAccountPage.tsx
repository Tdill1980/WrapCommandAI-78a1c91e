/**
 * WPW Account Page
 * Version: 1.0.0 - Feb 9, 2026
 * 
 * AdminFlux-style dashboard for WePrintWraps customers
 * Features: Orders table, detail drawer, ClubWPW + RestyleProAI cards
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, Package, LayoutDashboard, Palette, Crown, 
  HelpCircle, Settings, LogOut, ChevronRight, Clock,
  CheckCircle2, Truck, Bell, MoreHorizontal, X,
  User, Phone, Mail, RefreshCw, ExternalLink, Zap,
  Calendar, Eye, Download, Timer
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// Instagram gradient
const INSTAGRAM_GRADIENT = "bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]";
const INSTAGRAM_GRADIENT_HOVER = "hover:from-[#9b4dca] hover:via-[#ff4d4d] hover:to-[#ffd966]";

// Status config
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  'pending': { label: 'Pending', color: 'bg-yellow-500' },
  'processing': { label: 'Processing', color: 'bg-blue-500' },
  'in_production': { label: 'In Production', color: 'bg-purple-500' },
  'shipped': { label: 'Shipping', color: 'bg-cyan-500' },
  'delivered': { label: 'Delivered', color: 'bg-green-500' },
  'completed': { label: 'Completed', color: 'bg-green-600' },
  'cancelled': { label: 'Cancelled', color: 'bg-red-500' },
};

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  'paid': { label: 'Paid', color: 'text-green-400' },
  'pending': { label: 'Pending', color: 'text-yellow-400' },
  'failed': { label: 'Failed', color: 'text-red-400' },
  'refunded': { label: 'Refunded', color: 'text-gray-400' },
};

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  current_stage: string;
  payment_status: string;
  total_amount: number;
  shipping_method: string;
  created_at: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  product_image_url: string;
  quantity: number;
  square_footage: number;
  files: any[];
}

// Sidebar nav items
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'designs', label: 'Design Vault', icon: Palette },
];

export default function WPWAccountPage() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Customer email for lookup (would come from auth in production)
  const [customerEmail, setCustomerEmail] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check URL params for email
    const params = new URLSearchParams(window.location.search);
    const email = params.get('email');
    if (email) {
      setCustomerEmail(email);
      setIsAuthenticated(true);
      fetchOrders(email);
    }
  }, []);

  const fetchOrders = async (email: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shopflow_orders')
        .select('*')
        .ilike('customer_email', email)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderItems = async (orderNumber: string) => {
    try {
      const { data, error } = await supabase
        .from('shopflow_order_items')
        .select('*')
        .eq('order_number', orderNumber);

      if (error) throw error;
      setOrderItems(data || []);
    } catch (err) {
      console.error('Error fetching order items:', err);
    }
  };

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    fetchOrderItems(order.order_number);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (customerEmail) {
      setIsAuthenticated(true);
      fetchOrders(customerEmail);
      // Update URL
      window.history.pushState({}, '', `?email=${encodeURIComponent(customerEmail)}`);
    }
  };

  const handleTrack = () => {
    if (selectedOrder) {
      navigate(`/track/${selectedOrder.order_number}`);
    }
  };

  const handleReorder = () => {
    if (!selectedOrder || orderItems.length === 0) return;
    
    // Build WooCommerce add-to-cart URL
    const cartItems = orderItems
      .filter(item => item.product_name) // Filter valid items
      .map(item => `add-to-cart=${item.id}&quantity=${item.quantity}`)
      .join('&');
    
    // Open WPW cart in new tab
    window.open(`https://weprintwraps.com/cart/?${cartItems}`, '_blank');
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = searchQuery === '' || 
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.current_stage === statusFilter;
    const matchesPayment = paymentFilter === 'all' || order.payment_status === paymentFilter;
    
    return matchesSearch && matchesStatus && matchesPayment;
  });

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-[#12121a] border-white/10">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className={`w-16 h-16 rounded-2xl ${INSTAGRAM_GRADIENT} flex items-center justify-center mx-auto mb-4`}>
                <Package className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">WPW Account</h1>
              <p className="text-gray-400 mt-2">Enter your email to view your orders</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                type="email"
                placeholder="Enter your email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="bg-[#1a1a2e] border-white/10 text-white"
                required
              />
              <Button 
                type="submit" 
                className={`w-full ${INSTAGRAM_GRADIENT} ${INSTAGRAM_GRADIENT_HOVER} text-white border-0`}
              >
                View My Orders
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex">
      {/* Left Sidebar */}
      <div className="w-64 bg-[#12121a] border-r border-white/10 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${INSTAGRAM_GRADIENT} flex items-center justify-center`}>
              <Package className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">WPW Account</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                  activeNav === item.id
                    ? `${INSTAGRAM_GRADIENT} text-white`
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </div>

          {/* ClubWPW Pro Card */}
          <div className="mt-8 p-4 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#12121a] border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-white font-bold">ClubWPW</span>
              <Badge className={`${INSTAGRAM_GRADIENT} text-white text-xs border-0`}>Pro</Badge>
            </div>
            <ul className="space-y-2 text-sm text-gray-400 mb-4">
              <li>• Exclusive monthly drops</li>
              <li>• Early RestyleProAI access</li>
              <li>• 24/7 priority support</li>
            </ul>
            <div className="text-2xl font-bold text-white mb-3">$15.99<span className="text-sm text-gray-400">/month</span></div>
            <Button className={`w-full ${INSTAGRAM_GRADIENT} ${INSTAGRAM_GRADIENT_HOVER} text-white border-0`}>
              Activate now
            </Button>
          </div>
        </nav>

        {/* Bottom links */}
        <div className="p-4 border-t border-white/10 space-y-1">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all">
            <HelpCircle className="w-5 h-5" />
            <span>Help & Support</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
          <button 
            onClick={() => {
              setIsAuthenticated(false);
              setCustomerEmail('');
              setOrders([]);
              window.history.pushState({}, '', window.location.pathname);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Log out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-16 border-b border-white/10 flex items-center justify-between px-6">
          <h1 className="text-2xl font-bold text-white">Orders</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-10 bg-[#1a1a2e] border-white/10 text-white"
              />
            </div>
            <button className="relative p-2 text-gray-400 hover:text-white">
              <Bell className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                {customerEmail.charAt(0).toUpperCase()}
              </div>
              <div className="text-sm">
                <div className="text-white font-medium">{customerEmail}</div>
                <div className="text-gray-400">Customer</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 bg-[#1a1a2e] border-white/10 text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a2e] border-white/10">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="in_production">In Production</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>

          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-32 bg-[#1a1a2e] border-white/10 text-white">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a2e] border-white/10">
              <SelectItem value="all">All Payment</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1" />
          
          <span className="text-gray-400 text-sm">{filteredOrders.length} orders</span>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Orders Table */}
          <div className="flex-1 overflow-auto">
            {/* Dashboard Cards */}
            <div className="p-6 grid grid-cols-2 gap-4">
              {/* ClubWPW Monthly Drop Card */}
              <Card className="bg-gradient-to-br from-[#1a1a2e] to-[#0f0f1a] border-white/10 overflow-hidden">
                <CardContent className="p-0">
                  <div className="aspect-video bg-gradient-to-br from-purple-900/50 to-pink-900/50 flex items-center justify-center relative">
                    <Badge className="absolute top-3 left-3 bg-white/10 text-white">MONTHLY DROP</Badge>
                    <Badge className={`absolute top-3 right-3 ${INSTAGRAM_GRADIENT} text-white border-0`}>Exclusive</Badge>
                    <Crown className="w-16 h-16 text-yellow-400" />
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-bold text-white">ClubWPW Monthly Drop</h3>
                    <p className="text-gray-400 text-sm mt-1">Exclusive designs for members</p>
                    <div className="flex items-center gap-2 mt-3 text-pink-400">
                      <Timer className="w-4 h-4" />
                      <span className="text-sm font-mono">22:58:38</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5">
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button 
                      className={`w-full mt-4 ${INSTAGRAM_GRADIENT} ${INSTAGRAM_GRADIENT_HOVER} text-white border-0`}
                      onClick={() => navigate('/designpanel')}
                    >
                      View DesignPanelPro
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* RestyleProAI Card */}
              <Card className="bg-gradient-to-br from-[#1a1a2e] to-[#0f0f1a] border-white/10 overflow-hidden">
                <CardContent className="p-0">
                  <div className="aspect-video bg-gradient-to-br from-cyan-900/50 to-purple-900/50 flex items-center justify-center relative">
                    <Badge className="absolute top-3 left-3 bg-white/10 text-white">FULL PANEL</Badge>
                    <Badge className={`absolute top-3 right-3 ${INSTAGRAM_GRADIENT} text-white border-0`}>Exclusive</Badge>
                    <Zap className="w-16 h-16 text-cyan-400" />
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-bold text-white">RestyleProAI</h3>
                    <Badge className="bg-pink-500/20 text-pink-400 border-0 mt-1">restyle</Badge>
                    <p className="text-gray-400 text-sm mt-2">Generate 3D wrap previews</p>
                    <div className="flex items-center gap-2 mt-3 text-pink-400">
                      <Timer className="w-4 h-4" />
                      <span className="text-sm font-mono">22:58:38</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5">
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button 
                      className={`w-full mt-4 ${INSTAGRAM_GRADIENT} ${INSTAGRAM_GRADIENT_HOVER} text-white border-0`}
                      onClick={() => window.open('https://restyleproai.com', '_blank')}
                    >
                      Generate 3D Wrap Render
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Orders Table */}
            <div className="px-6 pb-6">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-white/10">
                    <th className="pb-4 font-medium">Order №</th>
                    <th className="pb-4 font-medium">Customer</th>
                    <th className="pb-4 font-medium">Payment</th>
                    <th className="pb-4 font-medium">Total</th>
                    <th className="pb-4 font-medium">Status</th>
                    <th className="pb-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">Loading orders...</td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">No orders found</td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr 
                        key={order.id}
                        onClick={() => handleSelectOrder(order)}
                        className={`border-b border-white/5 cursor-pointer transition-all hover:bg-white/5 ${
                          selectedOrder?.id === order.id ? 'bg-white/10' : ''
                        }`}
                      >
                        <td className="py-4">
                          <div className="text-white font-medium">#{order.order_number}</div>
                          <div className="text-gray-400 text-sm">
                            {format(new Date(order.created_at), 'MMM d, HH:mm')}
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold">
                              {order.customer_name?.charAt(0) || 'C'}
                            </div>
                            <span className="text-white">{order.customer_name || 'Customer'}</span>
                          </div>
                        </td>
                        <td className="py-4">
                          <span className={PAYMENT_STATUS[order.payment_status || 'paid']?.color || 'text-gray-400'}>
                            ✓ {PAYMENT_STATUS[order.payment_status || 'paid']?.label || 'Paid'}
                          </span>
                        </td>
                        <td className="py-4 text-white font-medium">
                          ${order.total_amount?.toFixed(2) || '0.00'}
                        </td>
                        <td className="py-4">
                          <Badge className={`${STATUS_CONFIG[order.current_stage]?.color || 'bg-gray-500'} text-white border-0`}>
                            {STATUS_CONFIG[order.current_stage]?.label || order.current_stage || 'Pending'}
                          </Badge>
                        </td>
                        <td className="py-4">
                          <button className="p-2 text-gray-400 hover:text-white">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Order Detail Drawer */}
          {selectedOrder && (
            <div className="w-80 border-l border-white/10 bg-[#12121a] overflow-auto">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">Order #{selectedOrder.order_number}</span>
                    <Badge className={`${STATUS_CONFIG[selectedOrder.current_stage]?.color || 'bg-gray-500'} text-white text-xs border-0`}>
                      {STATUS_CONFIG[selectedOrder.current_stage]?.label || 'Pending'}
                    </Badge>
                  </div>
                  <div className="text-gray-400 text-sm mt-1">
                    Placed on {format(new Date(selectedOrder.created_at), 'MMM d, yyyy HH:mm')}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="p-1 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Customer Info */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-400 text-sm">Customer</span>
                  <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5">
                    Profile <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                    {selectedOrder.customer_name?.charAt(0) || 'C'}
                  </div>
                  <div>
                    <div className="text-white font-medium">{selectedOrder.customer_name || 'Customer'}</div>
                    <div className="text-gray-400 text-sm">{selectedOrder.customer_email}</div>
                    {selectedOrder.customer_phone && (
                      <div className="text-gray-400 text-sm">{selectedOrder.customer_phone}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="p-4 border-b border-white/10">
                <div className="text-gray-400 text-sm mb-3">Order items</div>
                <div className="space-y-3">
                  {orderItems.length === 0 ? (
                    <div className="text-gray-500 text-sm">Loading items...</div>
                  ) : (
                    orderItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-[#1a1a2e] overflow-hidden flex-shrink-0">
                          {item.product_image_url ? (
                            <img 
                              src={item.product_image_url} 
                              alt={item.product_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-6 h-6 text-gray-500" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm truncate">{item.product_name}</div>
                          {item.square_footage && (
                            <div className="text-gray-400 text-xs">{item.square_footage.toFixed(1)} sq ft</div>
                          )}
                        </div>
                        <div className="text-gray-400 text-sm">x{item.quantity}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Total */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Total:</span>
                  <span className="text-2xl font-bold text-white">${selectedOrder.total_amount?.toFixed(2) || '0.00'}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 flex gap-2">
                <Button 
                  onClick={handleTrack}
                  variant="outline" 
                  className="flex-1 border-white/10 text-white hover:bg-white/5"
                >
                  <Truck className="w-4 h-4 mr-2" />
                  Track
                </Button>
                <Button 
                  onClick={handleReorder}
                  className={`flex-1 ${INSTAGRAM_GRADIENT} ${INSTAGRAM_GRADIENT_HOVER} text-white border-0`}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reorder
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

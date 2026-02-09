/**
 * WPW Account Page
 * Version: 2.0.1 - Feb 9, 2026 - Cache bust v5
 * 
 * AdminFlux-style dashboard for WePrintWraps customers
 * Reference: AdminFlux dark theme with green accents
 */
console.log('[WPWAccountPage] v2.0.1 loaded - AdminFlux style');

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, Package, LayoutDashboard, Palette, Crown, 
  HelpCircle, Settings, LogOut, ChevronRight, Clock,
  CheckCircle2, Truck, X, User, Phone, Mail, 
  ExternalLink, Calendar, Eye, Download, MoreHorizontal,
  Star, Trophy, Sparkles, Filter, ArrowUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// Status config with AdminFlux-style colors
const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string }> = {
  'pending': { label: 'Pending', bgColor: 'bg-yellow-500/20', textColor: 'text-yellow-400' },
  'processing': { label: 'Processing', bgColor: 'bg-blue-500/20', textColor: 'text-blue-400' },
  'in_production': { label: 'In Production', bgColor: 'bg-purple-500/20', textColor: 'text-purple-400' },
  'shipped': { label: 'Shipping', bgColor: 'bg-cyan-500/20', textColor: 'text-cyan-400' },
  'delivered': { label: 'Delivered', bgColor: 'bg-green-500/20', textColor: 'text-green-400' },
  'completed': { label: 'Completed', bgColor: 'bg-green-500/20', textColor: 'text-green-400' },
  'cancelled': { label: 'Cancelled', bgColor: 'bg-red-500/20', textColor: 'text-red-400' },
  'pickups': { label: 'Pickups', bgColor: 'bg-yellow-500/20', textColor: 'text-yellow-400' },
};

const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  'paid': { label: 'Paid', color: 'text-green-400' },
  'pending': { label: 'Pending', color: 'text-yellow-400' },
  'failed': { label: 'Failed', color: 'text-red-400' },
  'refunded': { label: 'Refunded', color: 'text-gray-400' },
  'cancelled': { label: 'Cancelled', color: 'text-red-400' },
  'returned': { label: 'Returned', color: 'text-orange-400' },
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
  created_at: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  product_image_url: string;
  quantity: number;
  square_footage: number;
  unit_price: number;
}

// Sidebar nav items
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'designs', label: 'Design Vault', icon: Palette },
  { id: 'drops', label: 'Monthly Drops', icon: Calendar },
  { id: 'wotw', label: 'Wrap of the Week', icon: Trophy },
  { id: 'account', label: 'Account', icon: User },
];

export default function WPWAccountPage() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Mock customer data (would come from auth in production)
  const customer = {
    name: "Customer",
    email: "customer@example.com",
    phone: "(480) 649-9200",
    isClubMember: true,
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shopflow_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderItems = async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from('shopflow_order_items')
        .select('*')
        .eq('order_id', orderId);

      if (error) throw error;
      setOrderItems(data || []);
    } catch (err) {
      console.error('Error fetching order items:', err);
      setOrderItems([]);
    }
  };

  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    setDrawerOpen(true);
    fetchOrderItems(order.id);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedOrder(null);
    setOrderItems([]);
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = !searchQuery || 
      order.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.current_stage === statusFilter;
    const matchesPayment = paymentFilter === 'all' || order.payment_status === paymentFilter;
    return matchesSearch && matchesStatus && matchesPayment;
  });

  const orderTotal = orderItems.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#111111] border-r border-[#222] flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-[#222]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg">WePrintWraps</span>
              <p className="text-xs text-gray-500">ShopFlow Account</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                activeNav === item.id 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* ClubWPW Pro Card */}
        <div className="p-4">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] border border-[#333] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-5 h-5 text-green-400" />
              <span className="font-bold text-green-400">ClubWPW</span>
              <Badge className="bg-green-500/20 text-green-400 text-xs">Pro</Badge>
            </div>
            <ul className="text-xs text-gray-400 space-y-1 mb-4">
              <li>• Exclusive monthly designs</li>
              <li>• Priority support</li>
              <li>• Early access to drops</li>
            </ul>
            <p className="text-lg font-bold text-white mb-3">$15.99 <span className="text-sm font-normal text-gray-500">/ month</span></p>
            <Button className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold">
              Activate now
            </Button>
          </div>
        </div>

        {/* Bottom nav */}
        <div className="p-4 border-t border-[#222] space-y-1">
          <button className="w-full flex items-center gap-3 px-4 py-2 text-gray-400 hover:text-white rounded-lg hover:bg-[#1a1a1a]">
            <HelpCircle className="w-5 h-5" />
            <span>Help & Support</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 text-gray-400 hover:text-white rounded-lg hover:bg-[#1a1a1a]">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 text-gray-400 hover:text-white rounded-lg hover:bg-[#1a1a1a]">
            <LogOut className="w-5 h-5" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-[#222] flex items-center justify-between px-6">
          <h1 className="text-2xl font-bold">Orders</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64 bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-green-500/20 text-green-400 text-sm">
                  {getInitials(customer.name)}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <p className="text-white">{customer.email}</p>
                <p className="text-gray-500 text-xs">Customer</p>
              </div>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-[#222] flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 bg-[#1a1a1a] border-[#333]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-[#333]">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="in_production">In Production</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>

          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-32 bg-[#1a1a1a] border-[#333]">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-[#333]">
              <SelectItem value="all">All Payment</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" className="bg-[#1a1a1a] border-[#333] text-gray-400">
            <Filter className="w-4 h-4 mr-2" />
            All filters
          </Button>

          <div className="flex-1" />

          <Button variant="outline" className="bg-[#1a1a1a] border-[#333] text-gray-400">
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Sort by: Date
          </Button>
        </div>

        {/* Orders Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400"></div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Package className="w-12 h-12 mb-4" />
              <p>No orders found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[#111] sticky top-0">
                <tr className="text-left text-gray-500 text-sm">
                  <th className="px-6 py-4 font-medium">Order №</th>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Payment</th>
                  <th className="px-6 py-4 font-medium">Total</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const status = STATUS_CONFIG[order.current_stage] || STATUS_CONFIG['pending'];
                  const payment = PAYMENT_CONFIG[order.payment_status] || PAYMENT_CONFIG['pending'];
                  
                  return (
                    <tr 
                      key={order.id}
                      onClick={() => handleOrderClick(order)}
                      className="border-b border-[#222] hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-white">#{order.order_number}</p>
                          <p className="text-xs text-gray-500">
                            {format(new Date(order.created_at), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs">
                              {getInitials(order.customer_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-white">{order.customer_name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`flex items-center gap-1 ${payment.color}`}>
                          {order.payment_status === 'paid' && <CheckCircle2 className="w-4 h-4" />}
                          {payment.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-white">
                        ${order.total_amount?.toFixed(2) || '0.00'}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={`${status.bgColor} ${status.textColor} border-0`}>
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
                          <MoreHorizontal className="w-5 h-5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Order Detail Drawer */}
      {drawerOpen && selectedOrder && (
        <aside className="w-96 bg-[#111] border-l border-[#222] flex flex-col">
          {/* Drawer Header */}
          <div className="p-6 border-b border-[#222] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold">Order #{selectedOrder.order_number}</h2>
                <Badge className={`${STATUS_CONFIG[selectedOrder.current_stage]?.bgColor || 'bg-gray-500/20'} ${STATUS_CONFIG[selectedOrder.current_stage]?.textColor || 'text-gray-400'} border-0`}>
                  {STATUS_CONFIG[selectedOrder.current_stage]?.label || 'Unknown'}
                </Badge>
              </div>
              <p className="text-sm text-gray-500">
                Placed on {format(new Date(selectedOrder.created_at), 'MMM d, h:mm a')}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={closeDrawer} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Customer Info */}
          <div className="p-6 border-b border-[#222]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-500">Customer</span>
              <Button variant="outline" size="sm" className="bg-[#1a1a1a] border-[#333] text-gray-400">
                Profile <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-gradient-to-br from-green-400 to-cyan-500 text-white">
                  {getInitials(selectedOrder.customer_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-white">{selectedOrder.customer_name || 'Unknown'}</p>
                <p className="text-sm text-gray-500">{selectedOrder.customer_email}</p>
                <p className="text-sm text-gray-500">{selectedOrder.customer_phone}</p>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="flex-1 overflow-auto p-6">
            <h3 className="text-gray-500 mb-4">Order items</h3>
            <div className="space-y-4">
              {orderItems.length === 0 ? (
                <p className="text-gray-500 text-sm">No items found</p>
              ) : (
                orderItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-[#1a1a1a] rounded-lg flex items-center justify-center overflow-hidden">
                      {item.product_image_url ? (
                        <img src={item.product_image_url} alt={item.product_name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-8 h-8 text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-white text-sm">{item.product_name || 'Product'}</p>
                      <p className="text-green-400 font-bold">${item.unit_price?.toFixed(2) || '0.00'}</p>
                    </div>
                    <span className="text-gray-500 text-sm">x {item.quantity || 1}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Total & Actions */}
          <div className="p-6 border-t border-[#222]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-500">Total:</span>
              <span className="text-2xl font-bold text-white">${selectedOrder.total_amount?.toFixed(2) || orderTotal.toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-[#1a1a1a] border border-[#333] text-white hover:bg-[#222]">
                <Eye className="w-4 h-4 mr-2" />
                Track
              </Button>
              <Button className="flex-1 bg-[#1a1a1a] border border-[#333] text-white hover:bg-[#222]">
                <Download className="w-4 h-4 mr-2" />
                Invoice
              </Button>
            </div>
            {selectedOrder.customer_phone && (
              <Button variant="outline" className="w-full mt-2 bg-[#1a1a1a] border-[#333] text-gray-400">
                <Phone className="w-4 h-4 mr-2" />
                {selectedOrder.customer_phone}
              </Button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

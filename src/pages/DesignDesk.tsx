import React, { useState, useEffect } from 'react';
import { 
  FileText, Files, Clock, User, CheckCircle, AlertCircle,
  RefreshCw, Search, Filter, ExternalLink, Car, Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface DesignDeskItem {
  id: string;
  source: string;
  source_id: string;
  customer_email: string;
  customer_name: string;
  order_number: string | null;
  files: any[];
  file_count: number;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  wrap_type: string | null;
  notes: string | null;
  status: string;
  assigned_to: string | null;
  priority: number;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'bg-yellow-500', icon: <Clock className="h-4 w-4" /> },
  in_review: { label: 'In Review', color: 'bg-blue-500', icon: <FileText className="h-4 w-4" /> },
  needs_info: { label: 'Needs Info', color: 'bg-orange-500', icon: <AlertCircle className="h-4 w-4" /> },
  approved: { label: 'Approved', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4" /> },
  in_production: { label: 'In Production', color: 'bg-purple-500', icon: <Package className="h-4 w-4" /> },
  complete: { label: 'Complete', color: 'bg-gray-500', icon: <CheckCircle className="h-4 w-4" /> },
  rejected: { label: 'Rejected', color: 'bg-red-500', icon: <AlertCircle className="h-4 w-4" /> },
};

export default function DesignDesk() {
  const [items, setItems] = useState<DesignDeskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<DesignDeskItem | null>(null);
  const [stats, setStats] = useState({ total: 0, pending: 0, inReview: 0 });
  const { toast } = useToast();

  useEffect(() => {
    fetchItems();
  }, [statusFilter]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('design_desk')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      setItems(data || []);

      // Get stats
      const { data: allItems } = await supabase
        .from('design_desk')
        .select('status');
      
      if (allItems) {
        setStats({
          total: allItems.length,
          pending: allItems.filter(i => i.status === 'pending').length,
          inReview: allItems.filter(i => i.status === 'in_review').length,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error loading design desk',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (itemId: string, newStatus: string) => {
    const { error } = await supabase
      .from('design_desk')
      .update({ status: newStatus })
      .eq('id', itemId);

    if (error) {
      toast({ title: 'Error updating status', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Status updated' });
      fetchItems();
      if (selectedItem?.id === itemId) {
        setSelectedItem({ ...selectedItem, status: newStatus });
      }
    }
  };

  const filteredItems = items.filter(item =>
    searchQuery === '' ||
    item.customer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.order_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-80px)] bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Files className="h-5 w-5" />
            Design Desk
          </h1>
          <Button variant="ghost" size="icon" onClick={fetchItems}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </Card>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="needs_info">Needs Info</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="in_production">In Production</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="w-96 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer or order..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">Loading...</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No items found</div>
          ) : (
            <div className="divide-y">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedItem?.id === item.id ? 'bg-muted' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {item.customer_name || item.customer_email?.split('@')[0] || 'Unknown'}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {item.order_number || 'No order #'}
                      </div>
                      {item.vehicle_make && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Car className="h-3 w-3" />
                          {item.vehicle_year} {item.vehicle_make} {item.vehicle_model}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.created_at), 'MMM d')}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {item.file_count} files
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    {STATUS_CONFIG[item.status] && (
                      <Badge className={`${STATUS_CONFIG[item.status].color} text-white text-xs`}>
                        {STATUS_CONFIG[item.status].icon}
                        <span className="ml-1">{STATUS_CONFIG[item.status].label}</span>
                      </Badge>
                    )}
                    {item.priority > 0 && (
                      <Badge variant="destructive" className="text-xs">Rush</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Detail */}
      <div className="flex-1 flex flex-col">
        {selectedItem ? (
          <>
            <div className="p-4 border-b">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {selectedItem.customer_name || selectedItem.customer_email}
                  </h2>
                  <div className="text-sm text-muted-foreground">
                    {selectedItem.order_number && (
                      <span className="mr-4">Order: {selectedItem.order_number}</span>
                    )}
                    {selectedItem.vehicle_make && (
                      <span>
                        {selectedItem.vehicle_year} {selectedItem.vehicle_make} {selectedItem.vehicle_model}
                      </span>
                    )}
                  </div>
                </div>
                <Select 
                  value={selectedItem.status} 
                  onValueChange={(v) => updateStatus(selectedItem.id, v)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="needs_info">Needs Info</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="in_production">In Production</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-6">
                {/* Customer Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Customer</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div><strong>Email:</strong> {selectedItem.customer_email}</div>
                    <div><strong>Name:</strong> {selectedItem.customer_name || '-'}</div>
                  </CardContent>
                </Card>

                {/* Files */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Files ({selectedItem.file_count})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedItem.files?.map((file: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-muted rounded">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm">{file.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {Math.round((file.size || 0) / 1024)}KB
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                {selectedItem.notes && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{selectedItem.notes}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Source */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Source</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div><strong>From:</strong> {selectedItem.source}</div>
                    <div><strong>Received:</strong> {format(new Date(selectedItem.created_at), 'PPpp')}</div>
                    {selectedItem.assigned_to && (
                      <div><strong>Assigned to:</strong> {selectedItem.assigned_to}</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Files className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select an item to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

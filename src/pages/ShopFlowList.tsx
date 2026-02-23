import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useShopFlow } from "@/hooks/useShopFlow";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Clock, CheckCircle2, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MainLayout } from "@/layouts/MainLayout";

const statusConfig = {
  design_requested: { label: "Design Requested", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  awaiting_feedback: { label: "Awaiting Feedback", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  revision_sent: { label: "Revision Sent", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  ready_for_print: { label: "Ready for Print", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  in_production: { label: "In Production", color: "bg-primary/10 text-primary border-primary/20" },
  completed: { label: "Completed", color: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
};

export default function ShopFlowList() {
  const { orders, loading, refetch } = useShopFlow();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [selectedDays, setSelectedDays] = useState("1");

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await lovableFunctions.functions.invoke('sync-woo-manual', {
        body: { target: 'shopflow', days: parseInt(selectedDays) }
      });

      if (error) {
        console.error('Sync error:', error);
        toast({
          title: "Sync Failed",
          description: error.message || "Failed to sync orders from WooCommerce",
          variant: "destructive",
        });
      } else if (data && !data.success && data.error) {
        // Edge function returns 200 with { success: false, error } on failure
        console.error('Sync error:', data.error);
        toast({
          title: "Sync Failed",
          description: data.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sync Complete",
          description: `Synced ${data?.syncedShopFlow ?? 0} orders from last ${selectedDays} ${parseInt(selectedDays) === 1 ? 'day' : 'days'}`,
        });
        refetch();
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast({
        title: "Sync Failed",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'design_requested':
        return <ClipboardList className="h-4 w-4" />;
      case 'awaiting_feedback':
        return <Clock className="h-4 w-4" />;
      case 'ready_for_print':
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <MainLayout userName="Admin">
        <div className="w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-poppins">
            <span className="text-foreground">Shop</span>
            <span className="text-gradient">Flow</span>
            <span className="text-muted-foreground text-sm align-super">™</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Production workflow and shop management
          </p>
        </div>
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Loading orders...</p>
        </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout userName="Admin">
      <div className="w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-poppins">
            <span className="text-foreground">Shop</span>
            <span className="text-gradient">Flow</span>
            <span className="text-muted-foreground text-sm align-super">™</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Production workflow and shop management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedDays} onValueChange={setSelectedDays}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 Hours</SelectItem>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            onClick={handleManualSync} 
            disabled={syncing || loading}
          >
            {syncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Now
              </>
            )}
          </Button>
        </div>
      </div>

      {orders.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="max-w-lg mx-auto space-y-5">
            <div className="flex justify-center">
              <div className="p-3 bg-primary/10 rounded-lg">
                <ClipboardList className="w-8 h-8 text-primary" strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="text-xl font-semibold">No Orders Yet</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Orders from ApproveFlow will appear here for production tracking.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const statusInfo = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.design_requested;
                return (
                  <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/shopflow/${order.id}`)}>
                    <TableCell className="font-medium">{order.woo_order_number ?? order.order_number}</TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell className="text-muted-foreground">{order.product_type}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusInfo.color}>
                        <span className="flex items-center gap-1.5">
                          {getStatusIcon(order.status)}
                          {statusInfo.label}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.priority === 'high' && (
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                          High
                        </Badge>
                      )}
                      {order.priority === 'normal' && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                          Normal
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(order.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/shopflow/${order.id}`);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      </div>
    </MainLayout>
  );
}

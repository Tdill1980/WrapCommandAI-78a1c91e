import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Loader2, Eye, RefreshCw } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { MainLayout } from "@/layouts/MainLayout";

type ApproveFlowProject = Tables<"approveflow_projects">;

export default function ApproveFlowList() {
  const [projects, setProjects] = useState<ApproveFlowProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('approveflow_projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (data && !error) {
      setProjects(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Design product IDs that qualify for ApproveFlow
  const DESIGN_PRODUCT_IDS = [234, 58160, 290, 289];

  const syncFromWooCommerce = async () => {
    try {
      setSyncing(true);
      toast({
        title: 'Syncing Projects',
        description: 'Fetching recent orders from WooCommerce via proxy...',
      });

      // Step 1: Fetch recent orders via woo-proxy (browser → edge fn → WooCommerce)
      // This avoids the Cloudflare block that sync-woo-manual hits
      const { data: orders, error: proxyError } = await lovableFunctions.functions.invoke('woo-proxy', {
        body: { action: 'listRecentOrders', days: 30, perPage: 50 }
      });

      if (proxyError) throw proxyError;
      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        toast({ title: 'No Orders Found', description: 'No recent WooCommerce orders in the last 30 days.' });
        return;
      }

      // Step 2: Filter to design product orders only
      const designOrders = orders.filter((order: any) => {
        if (!order.line_items || !Array.isArray(order.line_items)) return false;
        return order.line_items.some((item: any) => DESIGN_PRODUCT_IDS.includes(item.product_id));
      });

      if (designOrders.length === 0) {
        toast({ title: 'No Design Orders', description: `Found ${orders.length} orders but none contain design products.` });
        return;
      }

      // Step 3: Upsert each design order into approveflow_projects
      let synced = 0;
      let skipped = 0;

      for (const order of designOrders) {
        const orderNumber = order.number?.toString();
        if (!orderNumber) continue;

        // Check if project already exists
        const { data: existing } = await supabase
          .from('approveflow_projects')
          .select('id')
          .eq('order_number', orderNumber)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const customerName = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'Unknown Customer';
        const designItem = order.line_items?.find((item: any) => DESIGN_PRODUCT_IDS.includes(item.product_id));
        const productType = designItem?.name || order.line_items?.[0]?.name || 'Custom Vehicle Wrap Design';

        // Extract design instructions from customer_note or meta_data
        let designInstructions = '';
        if (order.customer_note && order.customer_note.trim().length > 0) {
          designInstructions = order.customer_note.trim();
        } else if (order.meta_data && Array.isArray(order.meta_data)) {
          for (const meta of order.meta_data) {
            if (!meta.key) continue;
            const keyLower = meta.key.toLowerCase();
            const isDesignField = keyLower.includes('describe') || keyLower.includes('design') ||
              keyLower.includes('instruction') || keyLower.includes('detail') ||
              keyLower.includes('requirement') || keyLower.includes('note') ||
              keyLower.includes('message') || keyLower.includes('custom');
            const valueStr = typeof meta.value === 'string' ? meta.value :
              typeof meta.value === 'object' ? JSON.stringify(meta.value) : String(meta.value || '');
            if (isDesignField && valueStr.trim().length > 10) {
              designInstructions = valueStr.trim();
              break;
            }
          }
        }

        const { error: insertError } = await supabase
          .from('approveflow_projects')
          .insert({
            order_number: orderNumber,
            customer_name: customerName,
            customer_email: order.billing?.email || null,
            product_type: productType,
            order_total: parseFloat(order.total) || null,
            status: 'design_requested',
            design_instructions: designInstructions || null,
          });

        if (!insertError) {
          synced++;
        }
      }

      toast({
        title: 'Sync Complete',
        description: `Synced ${synced} new projects, ${skipped} already existed (${orders.length} total WooCommerce orders checked)`,
      });

      await fetchProjects();
    } catch (error: any) {
      console.error('[ApproveFlowList] Sync error:', error);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Unable to fetch from WooCommerce',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved': return 'default';
      case 'design_requested': return 'secondary';
      case 'proof_delivered': return 'secondary';
      case 'awaiting_feedback': return 'outline';
      case 'revision_sent': return 'outline';
      default: return 'secondary';
    }
  };

  const formatStatus = (status: string) => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <MainLayout>
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-poppins">
            <span className="text-foreground">Approve</span>
            <span className="text-gradient">Flow</span>
            <span className="text-muted-foreground text-sm align-super">™</span>
          </h1>
          <p className="text-muted-foreground mt-1">Manage all design approval workflows</p>
        </div>
        <Button 
          variant="outline" 
          onClick={syncFromWooCommerce} 
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
              Sync from WooCommerce
            </>
          )}
        </Button>
      </div>

      <Card className="dashboard-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Order #</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Customer Name</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Product Type</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Last Updated</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-muted-foreground">
                    No projects found
                  </td>
                </tr>
              ) : (
                projects.map((project) => (
                  <tr key={project.id} className="border-b border-border hover:bg-accent/5 transition-colors">
                    <td className="p-4 font-medium">{project.order_number}</td>
                    <td className="p-4">{project.customer_name}</td>
                    <td className="p-4">{project.product_type}</td>
                    <td className="p-4">
                      <Badge variant={getStatusBadgeVariant(project.status)}>
                        {formatStatus(project.status)}
                      </Badge>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {format(new Date(project.updated_at || project.created_at), 'MMM d, yyyy h:mm a')}
                    </td>
                    <td className="p-4">
                      <Button
                        onClick={() => navigate(`/approveflow/${project.id}`)}
                        size="sm"
                        className="gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Open
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
    </MainLayout>
  );
}

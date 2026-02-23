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

  const syncFromWooCommerce = async () => {
    try {
      setSyncing(true);
      toast({
        title: 'Syncing Projects',
        description: 'Fetching recent orders from WooCommerce...',
      });

      const { data, error } = await lovableFunctions.functions.invoke('sync-woo-manual', {
        body: { target: 'approveflow', days: 5 }
      });

      if (error) throw error;

      // Edge function returns 200 with { success: false, error } on failure
      if (data && !data.success && data.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Sync Complete',
        description: `Synced ${data?.syncedApproveFlow ?? 0} projects, skipped ${data?.skipped ?? 0} existing`,
      });

      await fetchProjects();
    } catch (error: any) {
      toast({
        title: 'Sync Failed',
        description: error.message,
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

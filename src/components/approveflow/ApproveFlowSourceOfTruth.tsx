// ============================================
// ApproveFlow OS — Source of Truth Panel (Zone 2)
// ============================================
// OS RULES:
// 1. WooCommerce data is canonical — READ ONLY
// 2. Customer Instructions displayed verbatim
// 3. Files show actual filename, not generic type
// 4. Timestamps show exact ingestion time
// 5. This data is IMMUTABLE — UI never edits it
// ============================================

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Lock, FileText, Download, ExternalLink, Clock, RefreshCw } from "lucide-react";
import { formatFullDateTime, formatShortDate, formatTimeOnly } from "@/lib/timezone-utils";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// OS-TRUE file role labels
const FILE_ROLE_LABELS: Record<string, string> = {
  'customer_upload': 'Customer file',
  'customer_logo': 'Logo',
  'customer_brand_guide': 'Brand guide',
  'customer_design_file': 'Design file',
  'customer_inspiration': 'Inspiration',
  'designer_2d_proof': '2D Proof',
  'designer_3d_render': '3D Render',
  'final_approval_proof': 'Approval PDF',
  // Legacy fallbacks
  'reference': 'Customer file',
  'logo': 'Logo',
  'example': 'Example',
};

interface Asset {
  id: string;
  file_url: string;
  file_type: string;
  original_filename?: string;
  source?: string;
  created_at: string;
}

interface ApproveFlowSourceOfTruthProps {
  orderNumber: string;
  orderCreatedAt: string;
  designInstructions?: string;
  assets: Asset[];
  projectId?: string;
  onResync?: () => void;
}

export function ApproveFlowSourceOfTruth({
  orderNumber,
  orderCreatedAt,
  designInstructions,
  assets,
  projectId,
  onResync,
}: ApproveFlowSourceOfTruthProps) {
  const [isResyncing, setIsResyncing] = useState(false);
  const { toast } = useToast();
  
  // Filter to only customer-uploaded files (from WooCommerce)
  const customerAssets = assets.filter(a => a.source === 'woocommerce');

  // Get human-readable label for file type
  const getFileLabel = (fileType: string) => {
    return FILE_ROLE_LABELS[fileType] || 'File';
  };

  // Get file extension from URL or filename
  const getFileExtension = (asset: Asset) => {
    const filename = asset.original_filename || asset.file_url;
    const ext = filename.split('.').pop()?.toUpperCase();
    return ext || 'FILE';
  };

  // Handle re-sync from WooCommerce
  // Uses woo-proxy to fetch (browser → woo-proxy → WooCommerce) to avoid Cloudflare blocks
  // Then processes the data via process-woocommerce-resync edge function
  const handleResync = async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "Project ID not available",
        variant: "destructive",
      });
      return;
    }

    setIsResyncing(true);
    try {
      // Step 1: Fetch order data from WooCommerce via woo-proxy
      // Browser requests aren't blocked by Cloudflare like edge function IPs
      const { data: orderData, error: proxyError } = await lovableFunctions.functions.invoke('woo-proxy', {
        body: { 
          action: 'getOrder',
          orderNumber: orderNumber,
        },
      });

      if (proxyError) throw proxyError;

      // woo-proxy now returns 200 with { error } on failure
      if (orderData && orderData.error) {
        throw new Error(orderData.error);
      }

      if (!orderData || (Array.isArray(orderData) && orderData.length === 0)) {
        throw new Error(`Order #${orderNumber} not found in WooCommerce`);
      }

      // woo-proxy returns an array for getOrder
      const order = Array.isArray(orderData) ? orderData[0] : orderData;

      // Step 2: Process the order data and update ApproveFlow
      const { data: processResult, error: processError } = await lovableFunctions.functions.invoke('process-woocommerce-resync', {
        body: { 
          projectId,
          orderData: order,
        },
      });

      if (processError) throw processError;

      if (processResult?.success) {
        toast({
          title: "Re-sync complete",
          description: processResult.message || "Order data refreshed from WooCommerce",
        });
        
        // Trigger parent refresh
        onResync?.();
      } else {
        throw new Error(processResult?.error || "Re-sync failed");
      }
    } catch (error: any) {
      console.error('[ResyncWC] Error:', error);
      toast({
        title: "Re-sync failed",
        description: error.message || "Unable to fetch data from WooCommerce",
        variant: "destructive",
      });
    } finally {
      setIsResyncing(false);
    }
  };

  // Show re-sync button if data appears incomplete
  const showResyncButton = projectId && (
    !designInstructions || 
    designInstructions.trim().length === 0 || 
    customerAssets.length === 0
  );

  return (
    <Card className="p-4 bg-card border-border">
      {/* Header with lock icon */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-500" />
          <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wide">
            Source of Truth — Order Intake
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {showResyncButton && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[9px] text-muted-foreground hover:text-foreground"
              onClick={handleResync}
              disabled={isResyncing}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isResyncing ? 'animate-spin' : ''}`} />
              {isResyncing ? 'Syncing...' : 'Re-sync'}
            </Button>
          )}
          <Badge variant="outline" className="text-[9px] border-muted-foreground/30 text-muted-foreground">
            READ ONLY
          </Badge>
        </div>
      </div>

      {/* Source + Timestamp */}
      <div className="flex items-center gap-2 mb-4 text-[10px] text-muted-foreground">
        <Badge variant="secondary" className="text-[9px] bg-muted/50">
          Source: WooCommerce Order #{orderNumber}
        </Badge>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatFullDateTime(orderCreatedAt)}
        </span>
      </div>

      {/* Customer Instructions Section */}
      <div className="mb-4">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Customer Instructions
        </h4>
        <div className="bg-muted/30 rounded-lg p-3 border border-border">
          {designInstructions && designInstructions.trim().length > 0 ? (
            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
              {designInstructions}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No instructions were provided at checkout.
              {showResyncButton && " Click 'Re-sync' to fetch from WooCommerce."}
            </p>
          )}
        </div>
      </div>

      {/* Customer Uploaded Files Section */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Customer Uploaded Files
        </h4>
        
        {customerAssets.length > 0 ? (
          <div className="space-y-2">
            {customerAssets.map((asset) => (
              <div 
                key={asset.id}
                className="flex items-center justify-between p-2 bg-muted/20 rounded-lg border border-border hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {asset.original_filename || getFileLabel(asset.file_type)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {getFileLabel(asset.file_type)} • {getFileExtension(asset)} • Uploaded {formatTimeOnly(asset.created_at)} {formatShortDate(asset.created_at)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* View button */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]">
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl">
                      {asset.file_url.match(/\.(pdf)$/i) ? (
                        <iframe 
                          src={asset.file_url} 
                          className="w-full h-[80vh]" 
                          title={asset.original_filename || 'Document'}
                        />
                      ) : (
                        <img 
                          src={asset.file_url} 
                          alt={asset.original_filename || 'Customer file'} 
                          className="w-full h-auto" 
                        />
                      )}
                    </DialogContent>
                  </Dialog>
                  
                  {/* Download button */}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 px-2 text-[10px]"
                    asChild
                  >
                    <a href={asset.file_url} download target="_blank" rel="noopener noreferrer">
                      <Download className="w-3 h-3" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-muted/20 rounded-lg p-3 border border-border">
            <p className="text-xs text-muted-foreground italic">
              No files were uploaded at checkout.
              {showResyncButton && " Click 'Re-sync' to fetch from WooCommerce."}
            </p>
          </div>
        )}
      </div>

      {/* Immutable Footer */}
      <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-[9px] text-muted-foreground">
        <Lock className="w-3 h-3" />
        <span>This data is immutable — sourced directly from WooCommerce order</span>
      </div>
    </Card>
  );
}

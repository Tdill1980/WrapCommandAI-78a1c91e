import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { emailsPaused, pausedResponse } from "../_shared/email-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Email kill switch - set to true when ready for production
const SEND_CUSTOMER_EMAILS = false;

serve(async (req) => {
  if (req.method !== "OPTIONS" && emailsPaused()) return pausedResponse(corsHeaders);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      eventType, 
      projectId, 
      versionId, 
      notes, 
      renderUrls 
    } = await req.json();

    console.log('Processing ApproveFlow event:', eventType, 'for project:', projectId);

    // Fetch project data
    const { data: project, error: projectError } = await supabase
      .from('approveflow_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new Error('Project not found');
    }

    // Fetch version data if provided
    let version = null;
    if (versionId) {
      const { data: versionData } = await supabase
        .from('approveflow_versions')
        .select('*')
        .eq('id', versionId)
        .single();
      version = versionData;
    }

    // Prepare event data
    const eventProperties: any = {
      project_id: project.id,
      order_number: project.order_number,
      customer_name: project.customer_name,
      customer_email: project.customer_email,
      product_type: project.product_type,
      status: project.status,
    };

    if (version) {
      eventProperties.version_number = version.version_number;
      eventProperties.version_url = version.file_url;
    }

    if (notes) {
      eventProperties.notes = notes;
    }

    if (renderUrls) {
      eventProperties.render_urls = renderUrls;
    }

    // Map event types to Klaviyo metric names
    const eventNameMap: Record<string, string> = {
      'proof_delivered': 'approveflow_proof_delivered',
      'revision_requested': 'approveflow_revision_requested',
      'version_uploaded': 'approveflow_version_uploaded',
      'design_approved': 'approveflow_design_approved',
      '3d_render_ready': 'approveflow_3d_render_ready',
      'new_chat_message': 'approveflow_new_chat_message',
    };

    const klavioyEventName = eventNameMap[eventType] || `approveflow_${eventType}`;

    // Send to Klaviyo (DISABLED until production ready)
    if (SEND_CUSTOMER_EMAILS) {
      const klaviyoResponse = await fetch(`${supabaseUrl}/functions/v1/send-klaviyo-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          eventName: klavioyEventName,
          properties: eventProperties,
          customerEmail: project.customer_email,
        }),
      });

      if (!klaviyoResponse.ok) {
        console.error('Failed to send Klaviyo event');
      }
    } else {
      console.log(`Customer emails disabled - skipping ${eventType} notification for:`, project.customer_email);
    }

    // Prepare WooCommerce meta data
    const wooMetaData: Record<string, any> = {};
    let orderNote = '';

    switch (eventType) {
      case 'proof_delivered':
        wooMetaData._approveflow_status = 'proof_delivered';
        if (version) wooMetaData._approveflow_proof_url = version.file_url;
        orderNote = 'Design proof delivered via WrapCommand ApproveFlow V3';
        break;
      case 'revision_requested':
        wooMetaData._approveflow_status = 'revision_requested';
        if (notes) wooMetaData._approveflow_revision_notes = notes;
        orderNote = 'Customer requested revision via ApproveFlow';
        
        // Send team notification email for revision request
        try {
          await fetch(`${supabaseUrl}/functions/v1/notify-approveflow-team`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              projectId,
              notificationType: 'revision_requested',
              customerName: project.customer_name,
              orderNumber: project.order_number,
              notes: notes || undefined,
            }),
          });
          console.log(`[approveflow-event] Team notification sent for revision request on order ${project.order_number}`);
        } catch (notifyErr) {
          console.error(`[approveflow-event] Failed to send team notification:`, notifyErr);
        }
        break;
      case 'design_approved':
        wooMetaData._approveflow_status = 'approved';
        if (version) wooMetaData._approveflow_approved_version = version.file_url;
        orderNote = 'Customer approved final design';
        break;
      case 'version_uploaded':
        if (version) wooMetaData._approveflow_latest_version = version.file_url;
        orderNote = `New design version ${version?.version_number} uploaded`;
        break;
      case '3d_render_ready':
        if (renderUrls) wooMetaData._approveflow_3d_urls = renderUrls;
        orderNote = '3D renders are ready for viewing';
        break;
    }

    // Update WooCommerce if we have meta data
    if (Object.keys(wooMetaData).length > 0) {
      const wooResponse = await fetch(`${supabaseUrl}/functions/v1/update-woo-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          orderNumber: project.order_number,
          metaData: wooMetaData,
          orderNote: orderNote,
        }),
      });

      if (!wooResponse.ok) {
        console.error('Failed to update WooCommerce order');
      }
    }

    // Record action in ApproveFlow
    await supabase.from('approveflow_actions').insert({
      project_id: projectId,
      action_type: eventType,
      payload: {
        version_id: versionId,
        notes,
        render_urls: renderUrls,
      },
    });

    // Sync with ShopFlow if there's a matching order
    await syncWithShopFlow(supabase, eventType, projectId);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in approveflow-event:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper function to sync with ShopFlow
async function syncWithShopFlow(supabaseClient: any, eventType: string, projectId: string) {
  try {
    // Get the project
    const { data: project } = await supabaseClient
      .from('approveflow_projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (!project) return;

    // Check if there's a matching ShopFlow order
    const { data: shopflowOrder } = await supabaseClient
      .from('shopflow_orders')
      .select('*')
      .eq('approveflow_project_id', projectId)
      .maybeSingle();

    if (!shopflowOrder) return;

    // Map ApproveFlow status to ShopFlow status
    const statusMap: Record<string, string> = {
      'design_requested': 'design_requested',
      'proof_delivered': 'awaiting_feedback',
      'awaiting_feedback': 'awaiting_feedback',
      'revision_sent': 'revision_sent',
      'approved': 'ready_for_print',
    };

    const newStatus = statusMap[project.status] || shopflowOrder.status;

    // Update ShopFlow order status
    await supabaseClient
      .from('shopflow_orders')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shopflowOrder.id);

    // Log the event
    await supabaseClient
      .from('shopflow_logs')
      .insert({
        order_id: shopflowOrder.id,
        event_type: `approveflow_${eventType}`,
        payload: { project_status: project.status },
      });

    console.log('ShopFlow synced:', { orderId: shopflowOrder.id, newStatus });
  } catch (error) {
    console.error('Error syncing with ShopFlow:', error);
  }
}

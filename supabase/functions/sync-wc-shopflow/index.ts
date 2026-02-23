// Rebuild trigger: Feb 8, 2026 - Phase 1: Multi-item support
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

// ============================================================
// PAID GATE: Only these statuses indicate a PAID order
// ============================================================
const PAID_STATUSES = ['processing', 'completed'];

// UNPAID statuses - NEVER create new ShopFlow records for these
const UNPAID_STATUSES = ['pending', 'pending-payment', 'on-hold', 'failed', 'cancelled', 'refunded'];

/**
 * Check if a WooCommerce order is PAID
 */
function isOrderPaid(wooStatus: string, datePaid: string | null): boolean {
  const normalizedStatus = normalizeStatus(wooStatus);
  if (PAID_STATUSES.includes(normalizedStatus)) return true;
  if (datePaid && datePaid.trim() !== '') return true;
  return false;
}

// Status mapping layer (internal staff view)
const wooToInternalStatus: Record<string, string> = {
  "processing": "order_received",
  "waiting-to-place-order": "order_received",
  "waiting-on-email-response": "order_received",
  "add-on": "order_received",
  "dropbox-link-sent": "order_received",
  "in-design": "in_design",
  "file-error": "action_required",
  "missing-file": "action_required",
  "design-complete": "awaiting_approval",
  "work-order-printed": "awaiting_approval",
  "ready-for-print": "preparing_for_print",
  "pre-press": "preparing_for_print",
  "print-production": "in_production",
  "lamination": "in_production",
  "finishing": "in_production",
  "ready-for-pickup": "ready_or_shipped",
  "shipping-cost": "ready_or_shipped",
  "shipped": "ready_or_shipped",
  "completed": "completed"
};

// Customer-facing stage mapping
const wooToCustomerStage: Record<string, string> = {
  "processing": "order_received",
  "waiting-to-place-order": "order_received",
  "waiting-on-email-response": "order_received",
  "add-on": "order_received",
  "dropbox-link-sent": "order_received",
  "file-error": "file_error",
  "missing-file": "missing_file",
  "in-design": "preparing_print_files",
  "lance": "preparing_print_files",
  "manny": "preparing_print_files",
  "design-complete": "awaiting_approval",
  "work-order-printed": "awaiting_approval",
  "ready-for-print": "preparing_print_files",
  "pre-press": "preflight",
  "print-production": "printing",
  "lamination": "laminating",
  "finishing": "cutting",
  "ready-for-pickup": "ready",
  "shipped": "ready",
  "completed": "ready"
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeStatus(value: any): string {
  if (!value) return "";
  return value.toString().trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
}

/**
 * Fetch WooCommerce product image by product ID
 */
async function fetchWooProductImage(productId: number | string): Promise<string | null> {
  try {
    const wooUrl = Deno.env.get('WOO_URL') || 'https://weprintwraps.com';
    const consumerKey = Deno.env.get('WOO_CONSUMER_KEY');
    const consumerSecret = Deno.env.get('WOO_CONSUMER_SECRET');
    if (!consumerKey || !consumerSecret) return null;

    const url = `${wooUrl}/wp-json/wc/v3/products/${productId}?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const product = await response.json();
    return product?.images?.[0]?.src || null;
  } catch (err) {
    console.error('Error fetching product image:', err);
    return null;
  }
}

/**
 * PHASE 1: Extract ALL line items with full details
 */
function extractAllLineItems(lineItems: any[]): any[] {
  if (!lineItems || lineItems.length === 0) return [];
  
  console.log(`📦 Extracting ${lineItems.length} line items...`);
  
  return lineItems.map((item, index) => {
    const metaData = item.meta_data || [];
    
    // Extract all useful meta fields
    let squareFootage = null;
    let material = null;
    let finish = null;
    let sizeDimensions = null;
    const files: any[] = [];
    
    for (const meta of metaData) {
      const key = meta.key?.toLowerCase() || '';
      const value = meta.value;
      
      // Square footage
      if (key.includes('square') || key.includes('sqft') || key.includes('sq_ft') || 
          key.includes('size') || key.includes('area') || key.includes('footage')) {
        squareFootage = parseFloat(value) || value;
      }
      
      // Material
      if (key.includes('material') || key.includes('film') || key.includes('vinyl')) {
        material = value;
      }
      
      // Finish
      if (key.includes('finish') || key.includes('laminate') || key.includes('lam')) {
        finish = value;
      }
      
      // Dimensions
      if (key.includes('dimension') || key.includes('width') || key.includes('height') || key.includes('length')) {
        sizeDimensions = sizeDimensions ? `${sizeDimensions}, ${value}` : value;
      }
      
      // Files attached to this line item
      if (key.includes('file') || key.includes('artwork') || key.includes('upload') || key.includes('design')) {
        if (typeof value === 'string' && value.startsWith('http')) {
          files.push({
            name: meta.key,
            url: value,
            status: 'uploaded',
            uploaded_at: new Date().toISOString()
          });
        } else if (Array.isArray(value)) {
          value.forEach((url: string) => {
            if (typeof url === 'string' && url.startsWith('http')) {
              files.push({ name: meta.key, url, status: 'uploaded', uploaded_at: new Date().toISOString() });
            }
          });
        }
      }
    }
    
    const lineItem = {
      woo_line_item_id: item.id,
      product_id: item.product_id,
      product_name: item.name || 'Unknown Product',
      product_image_url: item.image?.src || null,
      quantity: item.quantity || 1,
      square_footage: squareFootage,
      material,
      finish,
      size_dimensions: sizeDimensions,
      files,
      files_uploaded: files.length,
      file_status: files.length > 0 ? 'complete' : 'pending'
    };
    
    console.log(`  📋 Item ${index + 1}: ${lineItem.product_name} (qty: ${lineItem.quantity}, files: ${files.length})`);
    
    return lineItem;
  });
}

/**
 * Create or update line items in shopflow_order_items
 */
async function syncLineItems(supabase: any, orderId: string, orderNumber: string, lineItems: any[]) {
  console.log(`📦 Syncing ${lineItems.length} line items for order ${orderNumber}...`);
  
  // Delete existing line items for this order (to handle updates)
  await supabase
    .from('shopflow_order_items')
    .delete()
    .eq('order_number', orderNumber);
  
  // Insert all line items
  const itemsToInsert = lineItems.map(item => ({
    order_id: orderId,
    order_number: orderNumber,
    ...item
  }));
  
  const { error } = await supabase
    .from('shopflow_order_items')
    .insert(itemsToInsert);
  
  if (error) {
    console.error('Error inserting line items:', error);
  } else {
    console.log(`✅ Synced ${lineItems.length} line items`);
  }
  
  // Calculate totals
  const totalItems = lineItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const itemsWithFiles = lineItems.filter(item => item.files_uploaded > 0).length;
  
  return { totalItems, itemsWithFiles };
}

/**
 * Extract product summary (all product names)
 */
function extractProductSummary(lineItems: any[]): string {
  if (!lineItems || lineItems.length === 0) return 'Unknown Product';
  if (lineItems.length === 1) return lineItems[0].name || 'Unknown Product';
  
  // Multiple items - create summary
  const names = lineItems.map(item => item.name).filter(Boolean);
  if (names.length <= 2) {
    return names.join(', ');
  }
  return `${names[0]} + ${names.length - 1} more items`;
}

function mapWooStatusToShopFlow(wooStatus: string): string {
  const normalized = normalizeStatus(wooStatus);
  return wooToInternalStatus[normalized] || 'order_received';
}

function mapWooStatusToCustomerStage(wooStatus: string): string {
  const normalized = normalizeStatus(wooStatus);
  return wooToCustomerStage[normalized] || 'order_received';
}

function extractFiles(payload: any): any[] {
  const files: any[] = [];
  
  // Check order-level meta_data for file URLs
  if (payload.meta_data) {
    for (const meta of payload.meta_data) {
      const key = meta.key?.toLowerCase();
      if (key?.includes('file') || key?.includes('artwork') || key?.includes('upload')) {
        if (typeof meta.value === 'string' && meta.value.startsWith('http')) {
          files.push({ name: meta.key, url: meta.value, status: 'uploaded', uploaded_at: new Date().toISOString() });
        }
      }
    }
  }
  
  return files;
}

function extractAffiliateRefCode(payload: any): string | null {
  if (payload.coupon_lines && Array.isArray(payload.coupon_lines)) {
    for (const coupon of payload.coupon_lines) {
      const code = coupon.code?.toUpperCase();
      if (code && code.length >= 4 && code.length <= 15) {
        return code;
      }
    }
  }
  if (payload.meta_data) {
    const refMeta = payload.meta_data.find((m: any) => 
      m.key === '_affiliate_ref' || m.key === 'ref_code' || m.key === 'affiliate_code'
    );
    if (refMeta) return refMeta.value;
  }
  return null;
}

async function trackQuoteConversion(supabase: any, customerEmail: string, orderNumber: string, orderTotal: number) {
  try {
    const { data: quote } = await supabase
      .from("quotes")
      .select("id, customer_email, quote_number")
      .eq("customer_email", customerEmail)
      .eq("converted_to_order", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (quote) {
      await supabase.from("quotes").update({
        converted_to_order: true,
        conversion_date: new Date().toISOString(),
        woo_order_id: orderNumber,
        conversion_revenue: orderTotal,
        status: "completed",
      }).eq("id", quote.id);
      
      console.log(`✅ Quote ${quote.id} converted to order ${orderNumber}`);
    }
  } catch (error) {
    console.error("Error tracking quote conversion:", error);
  }
}

async function sendKlaviyoEvent(eventName: string, properties: any, customerEmail: string) {
  try {
    const klaviyoKey = Deno.env.get('KLAVIYO_API_KEY');
    if (!klaviyoKey) return;

    await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      },
      body: JSON.stringify({
        data: {
          type: 'event',
          attributes: {
            profile: { data: { type: 'profile', attributes: { email: customerEmail } } },
            metric: { data: { type: 'metric', attributes: { name: eventName } } },
            properties,
            time: new Date().toISOString()
          }
        }
      })
    });
  } catch (error) {
    console.error('Error sending Klaviyo event:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const contentType = req.headers.get('content-type') || '';
    let payload;
    
    if (contentType.includes('application/json')) {
      payload = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      if (text.includes('webhook_id')) {
        return new Response(JSON.stringify({ message: 'Webhook test received' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw new Error('URL-encoded payload not supported');
    } else {
      payload = JSON.parse(await req.text());
    }
    
    console.log('WooCommerce webhook received for order:', payload.number || payload.id);

    // Extract order data
    const displayNumber = payload.number?.toString();
    const internalId = payload.id?.toString();
    const orderNumber = displayNumber || internalId;
    const customerName = `${payload.billing?.first_name || ''} ${payload.billing?.last_name || ''}`.trim() || 'Guest';
    const customerEmail = payload.billing?.email || '';
    const wooStatus = payload.status;
    const status = mapWooStatusToShopFlow(wooStatus);
    const customerStage = mapWooStatusToCustomerStage(wooStatus);
    
    // PHASE 1: Extract ALL line items
    const lineItems = extractAllLineItems(payload.line_items);
    const productType = extractProductSummary(payload.line_items);
    const orderLevelFiles = extractFiles(payload);
    const affiliateRefCode = extractAffiliateRefCode(payload);
    
    // Get first product image
    const productId = payload.line_items?.[0]?.product_id;
    const productImageUrl = productId ? await fetchWooProductImage(productId) : null;

    if (!orderNumber) {
      throw new Error('Order number is required');
    }

    // Check if order exists
    const { data: existingOrder } = await supabase
      .from('shopflow_orders')
      .select('id, timeline, files, customer_stage')
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (existingOrder) {
      console.log('Updating existing ShopFlow order:', orderNumber);
      
      // Sync line items
      const { totalItems, itemsWithFiles } = await syncLineItems(supabase, existingOrder.id, orderNumber, lineItems);
      
      // Determine file status
      const allFiles = [...(existingOrder.files || []), ...orderLevelFiles];
      let updatedCustomerStage = customerStage;
      let updatedTimeline = existingOrder.timeline || {};
      
      // Auto-trigger files_received if files exist
      if ((allFiles.length > 0 || itemsWithFiles > 0) && customerStage === 'order_received') {
        updatedCustomerStage = 'files_received';
        updatedTimeline['files_received'] = new Date().toISOString();
      }
      
      if (!updatedTimeline[updatedCustomerStage]) {
        updatedTimeline[updatedCustomerStage] = new Date().toISOString();
      }
      
      await supabase
        .from('shopflow_orders')
        .update({
          status,
          customer_stage: updatedCustomerStage,
          timeline: updatedTimeline,
          files: allFiles,
          customer_email: customerEmail,
          affiliate_ref_code: affiliateRefCode,
          product_image_url: productImageUrl,
          product_type: productType,
          total_items: totalItems,
          items_with_files: itemsWithFiles,
          order_total: parseFloat(payload.total || '0'),
          updated_at: new Date().toISOString(),
        })
        .eq('order_number', orderNumber);

      if (customerEmail) {
        await sendKlaviyoEvent('shopflow_status_changed', {
          order_number: orderNumber,
          internal_status: status,
          total_items: totalItems,
          product_type: productType
        }, customerEmail);
      }

      return new Response(
        JSON.stringify({ message: 'ShopFlow order updated', orderId: existingOrder.id, lineItems: lineItems.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PAID GATE for new orders
    const datePaid = payload.date_paid;
    const isPaid = isOrderPaid(wooStatus, datePaid);
    
    if (!isPaid) {
      console.log(`⛔ PAID GATE BLOCKED: Order ${orderNumber} is UNPAID`);
      return new Response(
        JSON.stringify({ message: 'Order not synced - not paid', order_number: orderNumber, blocked_by: 'PAID_GATE' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`✅ PAID GATE PASSED: Order ${orderNumber}`);

    // Initialize timeline
    const initialTimeline: Record<string, string> = {};
    let initialCustomerStage = customerStage;
    const allLineItemFiles = lineItems.filter(item => item.files_uploaded > 0).length;
    
    if ((orderLevelFiles.length > 0 || allLineItemFiles > 0) && customerStage === 'order_received') {
      initialCustomerStage = 'files_received';
      initialTimeline['order_received'] = new Date().toISOString();
      initialTimeline['files_received'] = new Date().toISOString();
    } else {
      initialTimeline[initialCustomerStage] = new Date().toISOString();
    }
    
    // Create new order
    const { data: newOrder, error: insertError } = await supabase
      .from('shopflow_orders')
      .insert({
        order_number: orderNumber,
        customer_name: customerName,
        product_type: productType,
        status,
        customer_stage: initialCustomerStage,
        customer_email: customerEmail,
        timeline: initialTimeline,
        files: orderLevelFiles,
        product_image_url: productImageUrl,
        woo_order_id: internalId ? parseInt(internalId) : null,
        woo_order_number: displayNumber ? parseInt(displayNumber) : null,
        priority: 'normal',
        affiliate_ref_code: affiliateRefCode,
        order_total: parseFloat(payload.total || '0'),
        total_items: lineItems.reduce((sum, item) => sum + (item.quantity || 1), 0),
        items_with_files: allLineItemFiles,
        is_paid: true,
        hidden: false,
        woo_status_raw: wooStatus,
        woo_date_paid: datePaid || new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Sync line items
    await syncLineItems(supabase, newOrder.id, orderNumber, lineItems);

    // Log creation
    await supabase.from('shopflow_logs').insert({
      order_id: newOrder.id,
      event_type: 'job_created',
      payload: { source: 'woocommerce', woo_status: wooStatus, line_items: lineItems.length },
    });

    // Track conversions
    if (customerEmail) {
      await trackQuoteConversion(supabase, customerEmail, orderNumber, parseFloat(payload.total || '0'));
      await sendKlaviyoEvent('shopflow_job_created', {
        order_number: orderNumber,
        customer_name: customerName,
        total_items: lineItems.reduce((sum, item) => sum + (item.quantity || 1), 0),
        product_type: productType
      }, customerEmail);
    }

    console.log(`✅ ShopFlow order created: ${newOrder.id} with ${lineItems.length} line items`);

    return new Response(
      JSON.stringify({ message: 'ShopFlow order created', orderId: newOrder.id, lineItems: lineItems.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error syncing WooCommerce to ShopFlow:', error);
    // Always return 200 so the Supabase client can display the structured error
    // payload instead of failing with generic "Edge Function returned a non-2xx status code".
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

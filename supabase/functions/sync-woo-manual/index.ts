import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  
  if (PAID_STATUSES.includes(normalizedStatus)) {
    return true;
  }
  
  if (datePaid && datePaid.trim() !== '') {
    return true;
  }
  
  return false;
}

// Design product IDs that should go to ApproveFlow
const DESIGN_PRODUCT_IDS = [
  234,   // Custom Vehicle Wrap Design
  58160, // Custom Vehicle Wrap Design (Copy) - Draft
  290,   // Hourly Design
  289    // File Output
];

/**
 * Normalize WooCommerce status strings to handle variations
 */
function normalizeStatus(value: any): string {
  if (!value) return "";
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * Fetch product thumbnail from WooCommerce
 */
async function fetchWooProductImage(productId: number | null, wooKey: string, wooSecret: string): Promise<string | null> {
  if (!productId) return null;
  try {
    const credentials = `${wooKey}:${wooSecret}`;
    const base64Credentials = btoa(credentials);
    const authHeader = `Basic ${base64Credentials}`;
    const url = `https://weprintwraps.com/wp-json/wc/v3/products/${productId}`;
    const response = await fetch(url, {
      headers: { 
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) return null;
    const product = await response.json();
    return product?.images?.[0]?.src ?? null;
  } catch (err) {
    console.error("❌ Failed to fetch Woo product image:", err);
    return null;
  }
}

/**
 * WOO → INTERNAL STATUS MAPPING
 * NOTE: These only apply to PAID orders
 */
const wooToInternalStatus: Record<string, string> = {
  "processing": "order_received",
  "waiting-to-place-order": "order_received",
  "waiting-on-email-response": "order_received",
  "add-on": "order_received",
  "dropbox-link-sent": "order_received",
  "in-design": "in_design",
  "lance": "in_design",
  "manny": "in_design",
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

/**
 * INTERNAL → CUSTOMER STAGE MAPPING
 */
const internalToCustomerStatus: Record<string, string> = {
  order_received: "Order Received",
  in_design: "In Design",
  action_required: "Action Needed (File Issue)",
  awaiting_approval: "Awaiting Your Approval",
  preparing_for_print: "Preparing for Print",
  in_production: "In Production",
  ready_or_shipped: "Ready / Shipped",
  completed: "Completed"
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body with error handling
    let target = 'both';
    let days = 7;
    
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await req.json();
        target = body.target || 'both';
        days = body.days || 7;
      }
    } catch (parseError) {
      console.warn('Failed to parse request body, using defaults:', parseError);
      // Use defaults if parsing fails
    }
    
    console.log(`Manual sync requested for: ${target}, last ${days} days`);

    const wooKey = Deno.env.get('WOO_CONSUMER_KEY');
    const wooSecret = Deno.env.get('WOO_CONSUMER_SECRET');
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!wooKey || !wooSecret) {
      throw new Error('WooCommerce credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate date for filtering
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - days);
    const afterISO = afterDate.toISOString();

    // Fetch orders from WooCommerce using proper base64 encoding for Deno
    const credentials = `${wooKey}:${wooSecret}`;
    const base64Credentials = btoa(credentials);
    const authHeader = `Basic ${base64Credentials}`;
    const wooUrl = `https://weprintwraps.com/wp-json/wc/v3/orders?per_page=100&orderby=date&order=desc&after=${afterISO}`;
    
    console.log('Fetching from WooCommerce...');
    console.log('Using auth with key ending in:', wooKey.slice(-4));
    console.log('Request URL:', wooUrl);
    
    // Create an AbortController with 30-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    let wooResponse;
    try {
      wooResponse = await fetch(wooUrl, {
        headers: { 
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('WooCommerce API request timed out after 30 seconds');
      }
      console.error('Fetch error:', fetchError);
      throw new Error(`Failed to fetch from WooCommerce: ${fetchError.message}`);
    }

    console.log(`WooCommerce API Response Status: ${wooResponse.status} ${wooResponse.statusText}`);
    console.log(`WooCommerce API Response Headers:`, Object.fromEntries(wooResponse.headers.entries()));

    if (!wooResponse.ok) {
      let errorText = '';
      try {
        errorText = await wooResponse.text();
        console.error(`WooCommerce API error response:`, errorText.substring(0, 500));
      } catch (textError) {
        console.error('Could not read error response body:', textError);
      }
      throw new Error(`WooCommerce API error: ${wooResponse.status} ${wooResponse.statusText} - ${errorText.substring(0, 200)}`);
    }

    // Clone the response so we can read it twice if needed
    const responseClone = wooResponse.clone();

    let orders;
    try {
      orders = await wooResponse.json();
      console.log(`✅ Successfully parsed ${orders.length} orders from WooCommerce`);
    } catch (jsonError: any) {
      console.error('❌ Failed to parse WooCommerce response as JSON:', jsonError);
      try {
        const responseText = await responseClone.text();
        console.error('Raw response body (first 500 chars):', responseText.substring(0, 500));
        console.error('Response body length:', responseText.length);
      } catch (textError) {
        console.error('Could not read response as text either:', textError);
      }
      throw new Error(`Failed to parse WooCommerce API response as JSON: ${jsonError.message}`);
    }

    let syncedShopFlow = 0;
    let syncedApproveFlow = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    // Limit processing to prevent timeout (process in batches)
    const maxOrdersToProcess = Math.min(orders.length, 5);
    console.log(`Processing ${maxOrdersToProcess} of ${orders.length} orders to prevent timeout`);

    for (let i = 0; i < maxOrdersToProcess; i++) {
      const order = orders[i];
      try {
        const orderNumber = order.number.toString();
        const customerName = `${order.billing.first_name} ${order.billing.last_name}`.trim() || 'Unknown Customer';
        const productType = order.line_items?.[0]?.name || 'Unknown Product';
        const productId = order.line_items?.[0]?.product_id || null;
        
        // Extract design requirements with comprehensive logging
        let designRequirements = '';
        
        console.log(`\n========== ORDER ${orderNumber} DESIGN REQUIREMENTS EXTRACTION ==========`);
        console.log(`Customer note present: ${!!order.customer_note}`);
        console.log(`Customer note length: ${order.customer_note?.length || 0}`);
        console.log(`Customer note value: "${order.customer_note || 'NONE'}"`);
        
        // First, try customer note
        if (order.customer_note && order.customer_note.trim().length > 0) {
          designRequirements = order.customer_note.trim();
          console.log(`✅ USING customer_note as design requirements`);
        }
        
        // Log meta_data structure
        console.log(`\nmeta_data array present: ${!!order.meta_data}`);
        console.log(`meta_data is array: ${Array.isArray(order.meta_data)}`);
        console.log(`meta_data length: ${order.meta_data?.length || 0}`);
        
        // Then search ALL meta_data fields
        if (order.meta_data && Array.isArray(order.meta_data)) {
          console.log(`\n📦 EXAMINING ${order.meta_data.length} META_DATA FIELDS:`);
          
          for (let i = 0; i < order.meta_data.length; i++) {
            const meta = order.meta_data[i];
            
            console.log(`\n--- META FIELD ${i + 1} ---`);
            console.log(`  key: "${meta.key}"`);
            console.log(`  value type: ${typeof meta.value}`);
            
            if (!meta.key) {
              console.log(`  ⚠️ Skipping - no key`);
              continue;
            }
            
            const valueStr = typeof meta.value === 'string' 
              ? meta.value 
              : (typeof meta.value === 'object' ? JSON.stringify(meta.value) : String(meta.value));
            
            console.log(`  value length: ${valueStr.length}`);
            console.log(`  value preview: "${valueStr.substring(0, 200)}${valueStr.length > 200 ? '...' : ''}"`);
            
            const keyLower = meta.key.toLowerCase();
            
            // Comprehensive keyword search - looking for design requirements
            const matchesKeywords = (
              keyLower.includes('describe') ||
              keyLower.includes('design') ||
              keyLower.includes('project') ||
              keyLower.includes('requirement') ||
              keyLower.includes('instruction') ||
              keyLower.includes('detail') ||
              keyLower.includes('note') ||
              keyLower.includes('description') ||
              keyLower.includes('request') ||
              keyLower.includes('spec') ||
              keyLower.includes('comment') ||
              keyLower.includes('message') ||
              keyLower.includes('extra') ||
              keyLower.includes('option') ||
              keyLower.includes('custom') ||
              keyLower.includes('field') ||
              keyLower.includes('wc_') || // WooCommerce custom fields
              keyLower.includes('_field') ||
              keyLower.includes('product_')
            );
            
            console.log(`  matches keywords: ${matchesKeywords}`);
            
            if (matchesKeywords && valueStr && valueStr.trim().length > 10) {
              console.log(`  ✅ MATCH FOUND! Using this field for design requirements`);
              designRequirements = valueStr.trim();
              break;
            }
          }
        }
        
        if (!designRequirements) {
          console.log(`\n⚠️ NO DESIGN REQUIREMENTS FOUND FOR ORDER ${orderNumber}`);
        } else {
          console.log(`\n✅ FINAL DESIGN REQUIREMENTS (${designRequirements.length} chars):`);
          console.log(`"${designRequirements.substring(0, 500)}${designRequirements.length > 500 ? '...' : ''}"`);
        }
        console.log(`========== END EXTRACTION FOR ORDER ${orderNumber} ==========\n`);
        
        const wooStatusRaw = order.status;
        const wooStatus = normalizeStatus(wooStatusRaw);
        
        console.log(`📊 Order ${orderNumber} - Raw: "${wooStatusRaw}", Normalized: "${wooStatus}"`);

        // Map to internal status and customer stage
        const internalStatus = wooToInternalStatus[wooStatus] || 'order_received';
        const customerStage = internalToCustomerStatus[internalStatus] || 'Order Received';
        
        console.log(`✅ Mapped to - Internal: "${internalStatus}", Customer: "${customerStage}"`);

        // Sync to ShopFlow
        if (target === 'shopflow' || target === 'both') {
          // ============================================================
          // PAID GATE: Check if order is paid before creating
          // ============================================================
          const datePaid = order.date_paid;
          const isPaid = isOrderPaid(wooStatus, datePaid);
          
          // Fetch product image
          const productImageUrl = await fetchWooProductImage(productId, wooKey, wooSecret);
          
          // Customer address intentionally not stored in shopflow_orders (no column in schema)

          // Check if order already exists
          const { data: existing } = await supabase
            .from('shopflow_orders')
            .select('id')
            .eq('order_number', orderNumber)
            .maybeSingle();

            if (!existing) {
              // PAID GATE: Block new unpaid orders
              if (!isPaid) {
                console.log(`⛔ PAID GATE BLOCKED: Order ${orderNumber} is UNPAID (status: ${wooStatus}, date_paid: ${datePaid})`);
                skipped++;
                continue;
              }
              
              console.log(`✅ PAID GATE PASSED: Order ${orderNumber} is PAID`);
              
              // Insert new order with all fields
              const { error: insertError } = await supabase
                .from('shopflow_orders')
                .insert({
                  order_number: orderNumber,
                  woo_order_id: order.id,
                  woo_order_number: order.number,
                  customer_name: customerName,
                  customer_email: order.billing?.email || null,
                  product_type: productType,
                  product_image_url: productImageUrl,
                  status: internalStatus,
                  customer_stage: customerStage,
                  priority: internalStatus === 'action_required' ? 'high' : 'normal',
                  created_at: order.date_created,
                  updated_at: new Date().toISOString(),
                  // Payment tracking fields
                  is_paid: true,
                  hidden: false,
                  woo_status_raw: wooStatusRaw,
                  woo_date_paid: datePaid || new Date().toISOString(),
                });

            if (insertError) {
              errors.push(`ShopFlow - Order ${orderNumber}: ${insertError.message}`);
            } else {
              syncedShopFlow++;
              console.log(`✅ Synced order ${orderNumber} to ShopFlow`);
            }
            } else {
              // Update existing order with all fields (updates allowed even for unpaid)
              const { error: updateError } = await supabase
                .from('shopflow_orders')
                .update({
                  woo_order_id: order.id,
                  woo_order_number: order.number,
                  customer_name: customerName,
                  customer_email: order.billing?.email || null,
                  product_type: productType,
                  product_image_url: productImageUrl,
                  status: internalStatus,
                  customer_stage: customerStage,
                  updated_at: new Date().toISOString(),
                  // Update payment tracking if order became paid
                  is_paid: isPaid,
                  woo_status_raw: wooStatusRaw,
                  woo_date_paid: datePaid || null,
                })
                .eq('id', existing.id);

            if (updateError) {
              errors.push(`ShopFlow - Order ${orderNumber} update: ${updateError.message}`);
            } else {
              syncedShopFlow++;
              console.log(`✅ Updated order ${orderNumber} in ShopFlow`);
            }
          }
        }

        // Sync to ApproveFlow (only for design product orders)
        if (target === 'approveflow' || target === 'both') {
          // Check if order contains design products (by product ID)
          let hasDesignProduct = false;
          let designProductName = '';
          
          if (order.line_items && Array.isArray(order.line_items)) {
            for (const item of order.line_items) {
              const productId = item.product_id;
              if (DESIGN_PRODUCT_IDS.includes(productId)) {
                hasDesignProduct = true;
                designProductName = item.name || 'Custom Vehicle Wrap Design';
                console.log(`✅ Design product found - ID: ${productId}, Name: "${designProductName}"`);
                break;
              }
            }
          }

          if (hasDesignProduct) {
            console.log(`✅ Design product found in order ${orderNumber}: "${designProductName}" - syncing to ApproveFlow`);
            
            // Check if project already exists
            const { data: existingProject } = await supabase
              .from('approveflow_projects')
              .select('id')
              .eq('order_number', orderNumber)
              .maybeSingle();

            if (!existingProject) {
              const { error: projectError } = await supabase
                .from('approveflow_projects')
                .insert({
                  order_number: orderNumber,
                  customer_name: customerName,
                  customer_email: order.billing.email,
                  product_type: designProductName,
                  order_total: parseFloat(order.total),
                  status: 'design_requested',
                  design_instructions: designRequirements || null,
                });

              if (projectError) {
                errors.push(`ApproveFlow - Order ${orderNumber}: ${projectError.message}`);
              } else {
                syncedApproveFlow++;
                console.log(`✅ Synced order ${orderNumber} to ApproveFlow`);
              }
            } else {
              skipped++;
            }
          } else {
            console.log(`⚠️ Order ${orderNumber} does not contain design products - skipping ApproveFlow sync`);
            if (order.line_items) {
              console.log(`   Product IDs in order: ${order.line_items.map((i: any) => `${i.product_id} (${i.name})`).join(', ')}`);
            }
          }
        }
      } catch (orderError: any) {
        errors.push(`Order ${order.number}: ${orderError.message}`);
        console.error(`Error processing order ${order.number}:`, orderError);
      }
    }

    const result = {
      success: true,
      syncedShopFlow,
      syncedApproveFlow,
      skipped,
      total: orders.length,
      processed: maxOrdersToProcess,
      note: maxOrdersToProcess < orders.length ? `Processed ${maxOrdersToProcess} of ${orders.length} orders to prevent timeout. Run again to process more.` : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log('Sync complete:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Manual sync error:', error);
    // Always return 200 so the Supabase client can display the structured error
    // payload instead of failing with generic "Edge Function returned a non-2xx status code".
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

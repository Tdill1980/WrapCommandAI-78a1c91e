import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Email kill switch - enabled for production
const SEND_CUSTOMER_EMAILS = true;

// ============================================
// OS CONSTANT — DO NOT DUPLICATE TEXT
// All customer-facing timelines must derive from this single source.
// ============================================
const FIRST_PROOF_TIMELINE_DAYS = 10;

// Design product IDs that should go to ApproveFlow
const DESIGN_PRODUCT_IDS = [
  234,   // Custom Vehicle Wrap Design
  58160, // Custom Vehicle Wrap Design (Copy) - Draft
  290,   // Hourly Design
  289    // File Output
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get content type to handle different payload formats
    const contentType = req.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);

    let webhook;

    // Handle JSON payloads (standard WooCommerce webhook format)
    if (contentType.includes('application/json')) {
      webhook = await req.json();
    } 
    // Handle form/URL-encoded test pings
    else if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      console.log('Received URL-encoded data:', text);
      
      // This is likely a test ping from WooCommerce, return success
      if (text.includes('webhook_id')) {
        return new Response(
          JSON.stringify({ message: 'ApproveFlow webhook test received successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('URL-encoded payload not supported for order sync');
    }
    // Try to parse as JSON anyway
    else {
      const text = await req.text();
      console.log('Received unknown content type, raw body:', text);
      webhook = JSON.parse(text);
    }

    console.log('WooCommerce webhook received:', webhook);

    // Parse WooCommerce order data
    // CRITICAL: Always use customer-facing order number (webhook.number), NEVER fall back to internal ID (webhook.id)
    const orderNumber = webhook.number?.toString();
    if (!orderNumber) {
      console.error('CRITICAL: webhook.number missing - cannot sync without customer-facing order number');
      console.error('webhook.id was:', webhook.id, '- this is NOT the customer order number');
      throw new Error('WooCommerce webhook missing required order number field');
    }
    const customerName = `${webhook.billing?.first_name || ''} ${webhook.billing?.last_name || ''}`.trim();
    const orderTotal = parseFloat(webhook.total || '0');
    const customerEmail = webhook.billing?.email;
    
    // Check if order contains design products (by product ID)
    let hasDesignProduct = false;
    let productType = 'Custom Wrap';
    
    if (webhook.line_items && webhook.line_items.length > 0) {
      for (const item of webhook.line_items) {
        const productId = item.product_id;
        if (DESIGN_PRODUCT_IDS.includes(productId)) {
          hasDesignProduct = true;
          productType = item.name || 'Custom Vehicle Wrap Design';
          console.log('✅ Design product found - ID:', productId, 'Name:', productType);
          break;
        }
      }
    }
    
    // Only process design product orders
    if (!hasDesignProduct) {
      console.log('⚠️ Order does not contain design products - skipping ApproveFlow sync for order:', orderNumber);
      console.log('   Product IDs in order:', webhook.line_items?.map((i: any) => `${i.product_id} (${i.name})`).join(', '));
      return new Response(
        JSON.stringify({ 
          message: 'Order does not contain design products', 
          orderNumber: orderNumber,
          skipped: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('✅ Design product found in order:', orderNumber, '- Product:', productType);

    // Extract design requirements from BOTH order meta_data AND line_items meta_data
    // WooCommerce Extra Product Options stores data in line_items[].meta_data
    let designRequirements = webhook.customer_note || '';
    const customerUploadedFiles: string[] = [];
    
    console.log('🔍 Extracting design requirements...');
    console.log('🔍 Customer note:', webhook.customer_note?.substring(0, 100) || 'None');
    console.log('🔍 Order meta_data fields:', webhook.meta_data?.length || 0);
    console.log('🔍 Line items:', webhook.line_items?.length || 0);
    
    // FIRST: Check line_items meta_data (Extra Product Options - THIS IS WHERE THE DATA ACTUALLY IS)
    if (webhook.line_items && Array.isArray(webhook.line_items)) {
      for (const item of webhook.line_items) {
        console.log(`📦 Line item: ${item.name} (ID: ${item.product_id})`);
        
        if (item.meta_data && Array.isArray(item.meta_data)) {
          console.log(`   📋 Line item meta_data: ${item.meta_data.length} fields`);
          
          for (const meta of item.meta_data) {
            const key = meta.key?.toLowerCase() || '';
            const displayKey = meta.display_key || meta.key || '';
            const value = meta.display_value || meta.value || '';
            
            console.log(`   📋 Meta: "${displayKey}" = ${typeof value === 'string' ? value.substring(0, 80) : JSON.stringify(value)}`);
            
            // Extract design requirements/instructions
            if (
              key.includes('describe') ||
              key.includes('design') ||
              key.includes('project') ||
              key.includes('requirements') ||
              key.includes('instructions') ||
              key.includes('details') ||
              key.includes('notes') ||
              key.includes('description') ||
              key.includes('request') ||
              key.includes('information') ||
              displayKey.toLowerCase().includes('describe') ||
              displayKey.toLowerCase().includes('project') ||
              displayKey.toLowerCase().includes('vehicle') ||
              displayKey.toLowerCase().includes('wrap')
            ) {
              if (typeof value === 'string' && value.length > 20) {
                designRequirements = value;
                console.log('✅ Found design requirements in line_item meta_data:', displayKey);
              }
            }
            
            // Extract uploaded files (URLs)
            if (
              key.includes('file') ||
              key.includes('upload') ||
              displayKey.toLowerCase().includes('file') ||
              displayKey.toLowerCase().includes('upload')
            ) {
              const fileValue = typeof value === 'string' ? value : '';
              // Check if it's a URL (could be direct URL or in HTML anchor tag)
              const urlMatch = fileValue.match(/https?:\/\/[^\s<>"]+/);
              if (urlMatch) {
                customerUploadedFiles.push(urlMatch[0]);
                console.log('✅ Found uploaded file:', urlMatch[0]);
              } else if (fileValue.startsWith('http')) {
                customerUploadedFiles.push(fileValue);
                console.log('✅ Found uploaded file:', fileValue);
              }
            }
          }
        }
      }
    }
    
    // SECOND: Also check order-level meta_data as fallback
    if (webhook.meta_data && Array.isArray(webhook.meta_data)) {
      console.log('🔍 Checking order-level meta_data...');
      
      for (const meta of webhook.meta_data) {
        const key = meta.key?.toLowerCase() || '';
        const value = meta.value || '';
        
        // Only use order-level if we didn't find in line_items
        if (!designRequirements || designRequirements === webhook.customer_note) {
          if (
            key.includes('describe') ||
            key.includes('design') ||
            key.includes('project') ||
            key.includes('requirements')
          ) {
            if (typeof value === 'string' && value.length > 20) {
              designRequirements = value;
              console.log('✅ Found design requirements in order meta_data:', meta.key);
            }
          }
        }
        
        // Check for files at order level too
        if (key.includes('file') || key.includes('upload')) {
          const urlMatch = (typeof value === 'string' ? value : '').match(/https?:\/\/[^\s<>"]+/);
          if (urlMatch && !customerUploadedFiles.includes(urlMatch[0])) {
            customerUploadedFiles.push(urlMatch[0]);
            console.log('✅ Found uploaded file in order meta:', urlMatch[0]);
          }
        }
      }
    }
    
    console.log('📊 EXTRACTION SUMMARY:');
    console.log('   Design requirements length:', designRequirements?.length || 0);
    console.log('   Uploaded files found:', customerUploadedFiles.length);
    if (designRequirements) {
      console.log('   Design preview:', designRequirements.substring(0, 150) + '...');
    }

    // Extract vehicle info from meta_data OR parse from design requirements text
    let vehicleInfo = null;
    if (webhook.meta_data && Array.isArray(webhook.meta_data)) {
      const vehicleFields = {
        year: webhook.meta_data.find((m: any) => m.key?.toLowerCase().includes('year'))?.value,
        make: webhook.meta_data.find((m: any) => m.key?.toLowerCase().includes('make'))?.value,
        model: webhook.meta_data.find((m: any) => m.key?.toLowerCase().includes('model'))?.value,
        type: webhook.meta_data.find((m: any) => m.key?.toLowerCase().includes('type') || m.key?.toLowerCase().includes('vehicle_type'))?.value,
      };
      
      if (vehicleFields.make || vehicleFields.model) {
        vehicleInfo = vehicleFields;
      }
    }
    
    // If no vehicle info found in meta_data, try to extract from design requirements text
    if (!vehicleInfo && designRequirements) {
      const yearMatch = designRequirements.match(/\b(19|20)\d{2}\b/);
      const makeModelMatch = designRequirements.match(/\b(19|20)\d{2}\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+([A-Z][A-Z0-9-]+)/i);
      
      if (makeModelMatch) {
        vehicleInfo = {
          year: makeModelMatch[1],
          make: makeModelMatch[2],
          model: makeModelMatch[3],
          type: null
        };
        console.log('📍 Extracted vehicle from text:', vehicleInfo);
      }
    }

    // Extract color info from meta_data OR parse from design requirements text
    let colorInfo = null;
    if (webhook.meta_data && Array.isArray(webhook.meta_data)) {
      const colorFields = {
        color: webhook.meta_data.find((m: any) => m.key?.toLowerCase().includes('color') && !m.key?.toLowerCase().includes('type'))?.value,
        color_hex: webhook.meta_data.find((m: any) => m.key?.toLowerCase().includes('hex'))?.value,
        finish: webhook.meta_data.find((m: any) => m.key?.toLowerCase().includes('finish'))?.value,
      };
      
      if (colorFields.color || colorFields.color_hex) {
        colorInfo = colorFields;
      }
    }
    
    // If no color info found in meta_data, try to extract from design requirements text
    if (!colorInfo && designRequirements) {
      const colorMatch = designRequirements.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is the color|color)/i);
      const finishMatch = designRequirements.match(/(gloss|satin|matte)\s+(?:finish)?/i);
      const codeMatch = designRequirements.match(/3M\s+([\d-]+)/i);
      
      if (colorMatch || finishMatch || codeMatch) {
        colorInfo = {
          color: colorMatch ? colorMatch[1] : null,
          finish: finishMatch ? finishMatch[1] : null,
          color_hex: codeMatch ? codeMatch[1] : null
        };
        console.log('🎨 Extracted color from text:', colorInfo);
      }
    }

    // Check if project already exists
    const { data: existingProject } = await supabase
      .from('approveflow_projects')
      .select('id')
      .eq('order_number', orderNumber)
      .single();

    if (existingProject) {
      console.log('Project already exists for order:', orderNumber);
      return new Response(
        JSON.stringify({ message: 'Project already exists', projectId: existingProject.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new ApproveFlow project
    console.log('💾 Saving project with:', {
      orderNumber,
      customerName,
      designRequirements: designRequirements?.substring(0, 100),
      vehicleInfo,
      colorInfo
    });
    
    const { data: newProject, error: projectError } = await supabase
      .from('approveflow_projects')
      .insert({
        order_number: orderNumber,
        customer_name: customerName || 'Unknown Customer',
        customer_email: customerEmail,
        product_type: productType,
        design_instructions: designRequirements,
        order_total: orderTotal,
        status: 'design_requested',
        vehicle_info: vehicleInfo,
        color_info: colorInfo,
      })
      .select()
      .single();

    if (projectError) {
      console.error('Error creating project:', projectError);
      throw projectError;
    }

    console.log('Created ApproveFlow project:', newProject.id);

    // Insert uploaded files that were already extracted from line_items meta_data
    const uploadedFiles: any[] = [];
    
    console.log('📁 Processing', customerUploadedFiles.length, 'uploaded files...');
    
    for (const fileUrl of customerUploadedFiles) {
      // Extract filename from URL
      const urlParts = fileUrl.split('/');
      const filename = urlParts[urlParts.length - 1];
      const extension = filename.split('.').pop()?.toLowerCase() || '';
      
      // OS-TRUE file roles: Use 'customer_upload' for all WooCommerce files
      // This replaces the old 'reference' generic type with proper asset role
      const fileType = 'customer_upload';
      
      // Insert as customer-visible asset with source = woocommerce
      const { error: assetError } = await supabase.from('approveflow_assets').insert({
        project_id: newProject.id,
        file_url: fileUrl,
        file_type: fileType,
        original_filename: decodeURIComponent(filename),
        source: 'woocommerce',
        visibility: 'customer',
      });
      
      if (assetError) {
        console.error('Error inserting asset:', assetError);
      } else {
        console.log('✅ Inserted asset:', filename, '(type:', fileType + ')');
        uploadedFiles.push({ url: fileUrl, type: fileType, filename });
      }
    }

    // designRequirements already extracted above - no need to re-extract

    // Create automatic welcome chat message
    // OS RULE: Message content is deterministic based on ingested state
    const hasArtwork = uploadedFiles.length > 0;
    const hasDesignInstructions = designRequirements && designRequirements.trim().length > 0;
    const hasIntakeData = hasArtwork || hasDesignInstructions;
    
    let welcomeMessage = '';
    
    if (hasIntakeData) {
      // DATA RECEIVED MESSAGE
      welcomeMessage = `👋 Welcome to ApproveFlow!

Your order #${orderNumber} has been received successfully.

✅ **Files received:** ${hasArtwork ? `We've received ${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} you uploaded during checkout.` : 'No files uploaded yet.'}
📝 **Design instructions received:** ${hasDesignInstructions ? 'Your design details have been added to your project.' : 'No specific instructions provided.'}

Our design team is now reviewing everything and getting started.

👉 **Next steps:**
You'll receive access to your **MyApproveFlow** page, where you can:
• View all design proofs and updates
• Send messages or additional details
• Upload more files, examples, or reference material
• Review, request revisions, and approve your design when ready

You can also track your order anytime through **MyShopFlow**.

⏱️ **Timeline:** Your first design proof is typically delivered within **${FIRST_PROOF_TIMELINE_DAYS} business days**.

If you think of anything else you'd like to add, just send us a message in MyApproveFlow — we're excited to work on your project!`;
    } else {
      // DATA MISSING MESSAGE
      welcomeMessage = `👋 Welcome to ApproveFlow!

Your order #${orderNumber} has been received successfully.

⚠️ **Next step needed:** We haven't received design files or detailed instructions yet.

👉 Please visit your **MyApproveFlow** page to:
• Upload files, logos, or examples
• Share design instructions or notes
• Message our design team directly

Once intake is complete, our team will get started right away.

⏱️ **Timeline:** Your first design proof is typically delivered within **${FIRST_PROOF_TIMELINE_DAYS} business days** after intake is complete.

You can also track your order anytime through **MyShopFlow**.`;
    }
    
    // Insert welcome message into chat
    await supabase.from('approveflow_chat').insert({
      project_id: newProject.id,
      sender: 'designer',
      message: welcomeMessage,
    });
    
    console.log('Created welcome chat message for project:', newProject.id);

    // Send customer welcome email via ApproveFlow branded email
    if (SEND_CUSTOMER_EMAILS && customerEmail) {
      const customerPortalUrl = `https://weprintwraps.com/my-approveflow/${orderNumber}`;
      
      try {
        const welcomeResponse = await fetch(`${supabaseUrl}/functions/v1/send-approveflow-welcome`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            projectId: newProject.id,
            customerEmail: customerEmail,
            customerName: customerName || 'Valued Customer',
            orderNumber: orderNumber,
            hasArtwork: hasArtwork,
            artworkCount: uploadedFiles.length,
            designInstructions: designRequirements,
            portalUrl: customerPortalUrl,
          }),
        });
        
        if (welcomeResponse.ok) {
          console.log('✅ Welcome email sent successfully to:', customerEmail);
        } else {
          const errorData = await welcomeResponse.json();
          console.error('❌ Welcome email failed:', errorData);
        }
      } catch (emailError) {
        console.error('❌ Error sending welcome email:', emailError);
        // Don't throw - email failure shouldn't fail the order sync
      }
    } else if (!SEND_CUSTOMER_EMAILS && customerEmail) {
      console.log('Customer emails disabled - skipping welcome email for:', customerEmail);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        projectId: newProject.id,
        orderNumber: orderNumber,
        filesUploaded: uploadedFiles.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-wc-approveflow:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Always return 200 so the Supabase client can display the structured error
    // payload instead of failing with generic "Edge Function returned a non-2xx status code".
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

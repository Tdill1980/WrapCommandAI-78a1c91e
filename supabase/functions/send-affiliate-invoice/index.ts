import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const supabase = createClient(
      (Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')) ?? '',
      (Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ?? ''
    );

    const { invoiceId } = await req.json();

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: 'Invoice ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch invoice with founder details
    const { data: invoice, error: invoiceError } = await supabase
      .from('affiliate_payout_invoices')
      .select(`
        *,
        affiliate_founders (
          full_name,
          email,
          company_name,
          affiliate_code,
          commission_rate
        )
      `)
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const founder = invoice.affiliate_founders;

    // Fetch commissions for this invoice
    const { data: commissions, error: commissionsError } = await supabase
      .from('affiliate_commissions')
      .select('*')
      .in('id', invoice.commission_ids);

    if (commissionsError) {
      throw new Error('Failed to fetch commissions');
    }

    // Generate email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .invoice-summary { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f3f4f6; padding: 10px; text-align: left; font-weight: 600; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Affiliate Commission Invoice</h1>
      <p>Your earnings are ready!</p>
    </div>
    <div class="content">
      <p>Hi ${founder.full_name},</p>
      
      <p>Great news! Your affiliate commission invoice is ready for the period from <strong>${new Date(invoice.period_start).toLocaleDateString()}</strong> to <strong>${new Date(invoice.period_end).toLocaleDateString()}</strong>.</p>

      <div class="invoice-summary">
        <h2 style="margin-top: 0;">Invoice Summary</h2>
        <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
        <p><strong>Total Commission:</strong> $${Number(invoice.total_amount).toFixed(2)}</p>
        <p><strong>Number of Sales:</strong> ${commissions?.length || 0}</p>
        <p><strong>Commission Rate:</strong> ${founder.commission_rate}%</p>
      </div>

      <h3>Commission Breakdown</h3>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Product</th>
            <th>Commission</th>
          </tr>
        </thead>
        <tbody>
          ${commissions?.map(c => `
            <tr>
              <td>#${c.order_number}</td>
              <td>${c.product_name || 'N/A'}</td>
              <td>$${Number(c.commission_amount).toFixed(2)}</td>
            </tr>
          `).join('') || ''}
        </tbody>
      </table>

      <p>Payment will be processed within 3-5 business days to your registered payment method.</p>

      <p>Thank you for being a valued WrapCommand AI affiliate partner! Your continued success drives our growth.</p>

      <p>Best regards,<br>
      <strong>The WrapCommand AI Team</strong></p>
    </div>
    <div class="footer">
      <p>Questions about your invoice? Contact us at support@wrapcommand.ai</p>
      <p>© ${new Date().getFullYear()} WrapCommand AI. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'WrapCommand AI <affiliates@wrapcommand.ai>',
      to: [founder.email],
      subject: `Your Affiliate Commission Invoice - ${invoice.invoice_number}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('Error sending email:', emailError);
      throw new Error('Failed to send email');
    }

    // Update invoice record
    await supabase
      .from('affiliate_payout_invoices')
      .update({
        sent_at: new Date().toISOString(),
        sent_to_email: founder.email,
        status: 'sent',
      })
      .eq('id', invoiceId);

    console.log('Invoice email sent successfully to:', founder.email);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invoice sent successfully',
        emailId: emailData?.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error sending invoice:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
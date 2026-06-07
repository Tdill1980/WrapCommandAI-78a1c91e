// =====================================================
// CMD-PRICING — CommandChat Pricing Calculator v1.2
// All 23 WPW Products with correct pricing
// Pricing source of truth: Avery $5.25/sqft, 3M $6.00/sqft (homepage rates)
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// ALL 23 WPW PRODUCTS
// ============================================
const PRODUCTS: Record<string, {
  id: number;
  name: string;
  price: number;
  type: 'per_sqft' | 'per_yard' | 'flat' | 'tiered';
  url: string;
  description?: string;
}> = {
  // PRINTED WRAP FILMS (per sqft)
  avery_wrap: {
    id: 79,
    name: 'Avery MPI 1105 with DOL 1460Z',
    price: 5.25,
    type: 'per_sqft',
    url: 'https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/',
    description: 'Premium printed wrap film with lamination'
  },
  '3m_wrap': {
    id: 72,
    name: '3M IJ180Cv3 with 8518',
    price: 6.00,
    type: 'per_sqft',
    url: 'https://weprintwraps.com/our-products/3m-ij180-printed-wrap-film/',
    description: 'Premium 3M printed wrap film with lamination'
  },

  // WINDOW PERF (per sqft)
  window_perf: {
    id: 80,
    name: 'Perforated Window Vinyl 50/50',
    price: 5.32,
    type: 'per_sqft',
    url: 'https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/',
    description: 'See-through from inside, graphics visible outside'
  },

  // CUT CONTOUR (per sqft, weeded & masked)
  cut_avery: {
    id: 108,
    name: 'Avery Contour-Cut',
    price: 6.32,
    type: 'per_sqft',
    url: 'https://weprintwraps.com/our-products/avery-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/',
    description: 'Cut vinyl graphics, weeded and masked'
  },
  cut_3m: {
    id: 19420,
    name: '3M Contour-Cut',
    price: 6.92,
    type: 'per_sqft',
    url: 'https://weprintwraps.com/our-products/3m-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/',
    description: 'Cut vinyl graphics, weeded and masked'
  },

  // WALL WRAP (per sqft)
  wall_wrap: {
    id: 70093,
    name: 'Wall Wrap Printed Vinyl',
    price: 3.25,
    type: 'per_sqft',
    url: 'https://weprintwraps.com/our-products/wall-wrap-printed-vinyl/',
    description: 'Indoor wall graphics'
  },

  // FADE WRAPS (tiered by side length)
  fade_wrap: {
    id: 58391,
    name: 'FadeWraps Pre-Designed',
    price: 600, // Base price for small
    type: 'tiered',
    url: 'https://weprintwraps.com/our-products/pre-designed-fade-wraps/',
    description: 'Gradient fade wraps - pricing by side length'
  },

  // INKFUSION (flat)
  inkfusion: {
    id: 69439,
    name: 'InkFusion Premium',
    price: 2075,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/inkfusion-premium/',
    description: 'Premium full vehicle wrap package'
  },

  // WRAP BY THE YARD ($95.50/yard, 60" wide)
  camo_carbon: {
    id: 1726,
    name: 'Camo & Carbon Wrap by the Yard',
    price: 95.50,
    type: 'per_yard',
    url: 'https://weprintwraps.com/our-products/camo-carbon-wrap-by-the-yard/',
    description: '60" wide, sold by the yard'
  },
  metal_marble: {
    id: 39698,
    name: 'Metal & Marble Wrap by the Yard',
    price: 95.50,
    type: 'per_yard',
    url: 'https://weprintwraps.com/our-products/wrap-by-the-yard-metal-marble/',
    description: '60" wide, sold by the yard'
  },
  wicked_wild: {
    id: 4181,
    name: 'Wicked & Wild Wrap by the Yard',
    price: 95.50,
    type: 'per_yard',
    url: 'https://weprintwraps.com/our-products/wrap-by-the-yard-wicked-wild-wrap-prints/',
    description: '60" wide, sold by the yard'
  },
  bape_camo: {
    id: 42809,
    name: 'Bape Camo Wrap by the Yard',
    price: 95.50,
    type: 'per_yard',
    url: 'https://weprintwraps.com/our-products/wrap-by-the-yard-bape-camo/',
    description: '60" wide, sold by the yard'
  },
  modern_trippy: {
    id: 52489,
    name: 'Modern & Trippy Wrap by the Yard',
    price: 95.50,
    type: 'per_yard',
    url: 'https://weprintwraps.com/our-products/wrap-by-the-yard-modern-trippy/',
    description: '60" wide, sold by the yard'
  },

  // DESIGN SERVICES (flat)
  custom_design: {
    id: 234,
    name: 'Custom Vehicle Wrap Design',
    price: 750,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/custom-wrap-design/',
    description: 'Full custom wrap design service'
  },
  design_copy: {
    id: 58160,
    name: 'Custom Design Copy/Draft',
    price: 500,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/custom-design-copy-draft/',
    description: 'Design copy or draft service'
  },
  design_hour: {
    id: 0,
    name: '1-Hour Design Fee',
    price: 95,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/custom-wrap-design/',
    description: 'Hourly design work, color matching, edits'
  },
  file_output: {
    id: 0,
    name: 'File Output Fee',
    price: 95,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/custom-wrap-design/',
    description: 'File preparation and output'
  },

  // SAMPLE BOOKS (flat)
  pantone: {
    id: 15192,
    name: 'Pantone Color Chart',
    price: 42,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/pantone-color-chart-30-x-52/',
    description: '30" x 52" Pantone reference chart'
  },
  camo_sample: {
    id: 475,
    name: 'Camo & Carbon Sample Book',
    price: 26.50,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/camo-carbon-sample-book/',
    description: 'Physical swatch book'
  },
  marble_sample: {
    id: 39628,
    name: 'Marble & Metals Swatch Book',
    price: 26.50,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/marble-metals-swatch-book/',
    description: 'Physical swatch book'
  },
  wicked_sample: {
    id: 4179,
    name: 'Wicked & Wild Swatch Book',
    price: 26.50,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/wicked-wild-swatch-book/',
    description: 'Physical swatch book'
  },

  // PRINT PRODUCTION PACKS (flat)
  pack_small: {
    id: 69664,
    name: 'Small Print Production Pack',
    price: 299,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/small-print-production-pack/',
    description: 'Small format print pack'
  },
  pack_medium: {
    id: 69671,
    name: 'Medium Print Production Pack',
    price: 499,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/medium-print-production-pack/',
    description: 'Medium format print pack'
  },
  pack_large: {
    id: 69680,
    name: 'Large Print Production Pack',
    price: 699,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/large-print-production-pack/',
    description: 'Large format print pack'
  },
  pack_xlarge: {
    id: 69686,
    name: 'XLarge Print Production Pack',
    price: 899,
    type: 'flat',
    url: 'https://weprintwraps.com/our-products/xlarge-print-production-pack/',
    description: 'Extra large format print pack'
  }
};

// Fade wrap tiered pricing
const FADE_TIERS = {
  small: { maxLength: 144, price: 600, label: 'Small (up to 144")' },
  medium: { maxLength: 172, price: 710, label: 'Medium (up to 172")' },
  large: { maxLength: 200, price: 825, label: 'Large (up to 200")' },
  xl: { maxLength: 240, price: 990, label: 'XL (up to 240")' }
};

const FADE_ADDONS = {
  hood: 160,
  front_bumper: 200,
  rear_bumper: 395,
  roof_small: 160,
  roof_large: 330
};

// Bulk discount tiers
function getBulkDiscount(totalSqft: number): { percent: number; tier: string } {
  if (totalSqft >= 2500) return { percent: 20, tier: '2500+ sqft' };
  if (totalSqft >= 1500) return { percent: 15, tier: '1500-2499 sqft' };
  if (totalSqft >= 1000) return { percent: 10, tier: '1000-1499 sqft' };
  if (totalSqft >= 500) return { percent: 5, tier: '500-999 sqft' };
  return { percent: 0, tier: 'standard' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { sqft, sqft_with_roof, product, vehicle_count, yards, side_length, fade_addons } = body;

    // Get product info
    const productKey = product || 'avery_wrap';
    const productInfo = PRODUCTS[productKey] || PRODUCTS.avery_wrap;

    console.log(`[cmd-pricing] Product: ${productKey}, Type: ${productInfo.type}`);

    // Handle different pricing types
    let finalPrice = 0;
    let priceBreakdown: any = {};

    switch (productInfo.type) {
      case 'per_sqft': {
        if (!sqft) {
          return new Response(JSON.stringify({ error: 'sqft required for this product' }), {
            status: 400, headers: corsHeaders
          });
        }

        const defaultSqft = sqft;
        const fullSqft = sqft_with_roof || Math.round(sqft * 1.1);
        const roofSqft = fullSqft - defaultSqft;

        const totalSqft = vehicle_count ? defaultSqft * vehicle_count : defaultSqft;
        const bulk = getBulkDiscount(totalSqft);

        const basePrice = defaultSqft * productInfo.price;
        const fullPrice = fullSqft * productInfo.price;
        const discountMultiplier = 1 - (bulk.percent / 100);

        finalPrice = Math.round(basePrice * discountMultiplier);
        const finalFullPrice = Math.round(fullPrice * discountMultiplier);
        const freeShipping = finalPrice >= 750;

        priceBreakdown = {
          sqft: { default: defaultSqft, with_roof: fullSqft, roof_only: roofSqft },
          prices: { default: finalPrice, with_roof: finalFullPrice, roof_only: Math.round((roofSqft * productInfo.price) * discountMultiplier) },
          discount: { percent: bulk.percent, tier: bulk.tier, vehicle_count: vehicle_count || 1 },
          shipping: { free: freeShipping, message: freeShipping ? 'FREE shipping included!' : 'Add to cart for shipping price' },
          formatted: {
            default: `$${finalPrice} (${defaultSqft} sqft - excludes roof)`,
            with_roof: `$${finalFullPrice} (${fullSqft} sqft - includes roof)`
          }
        };
        break;
      }

      case 'per_yard': {
        const yardCount = yards || 1;
        finalPrice = Math.round(productInfo.price * yardCount);
        const freeShipping = finalPrice >= 750;

        priceBreakdown = {
          yards: yardCount,
          price_per_yard: productInfo.price,
          prices: { total: finalPrice },
          shipping: { free: freeShipping, message: freeShipping ? 'FREE shipping included!' : 'Add to cart for shipping price' },
          formatted: {
            total: `$${finalPrice} (${yardCount} yard${yardCount > 1 ? 's' : ''} at $${productInfo.price}/yard)`
          }
        };
        break;
      }

      case 'flat': {
        finalPrice = productInfo.price;
        const freeShipping = finalPrice >= 750;

        priceBreakdown = {
          prices: { total: finalPrice },
          shipping: { free: freeShipping, message: freeShipping ? 'FREE shipping included!' : 'Add to cart for shipping price' },
          formatted: {
            total: `$${finalPrice} (flat rate)`
          }
        };
        break;
      }

      case 'tiered': {
        // Fade wraps - priced by side length
        let tier = FADE_TIERS.small;
        const length = side_length || 144;

        if (length <= 144) tier = FADE_TIERS.small;
        else if (length <= 172) tier = FADE_TIERS.medium;
        else if (length <= 200) tier = FADE_TIERS.large;
        else tier = FADE_TIERS.xl;

        finalPrice = tier.price;

        // Add fade addons if specified
        let addonTotal = 0;
        const addonDetails: string[] = [];
        if (fade_addons) {
          if (fade_addons.hood) { addonTotal += FADE_ADDONS.hood; addonDetails.push(`Hood +$${FADE_ADDONS.hood}`); }
          if (fade_addons.front_bumper) { addonTotal += FADE_ADDONS.front_bumper; addonDetails.push(`Front Bumper +$${FADE_ADDONS.front_bumper}`); }
          if (fade_addons.rear_bumper) { addonTotal += FADE_ADDONS.rear_bumper; addonDetails.push(`Rear+Bumper +$${FADE_ADDONS.rear_bumper}`); }
          if (fade_addons.roof) {
            const roofPrice = length > 172 ? FADE_ADDONS.roof_large : FADE_ADDONS.roof_small;
            addonTotal += roofPrice;
            addonDetails.push(`Roof +$${roofPrice}`);
          }
        }

        finalPrice += addonTotal;

        priceBreakdown = {
          tier: tier.label,
          side_length: length,
          base_price: tier.price,
          addons: addonDetails,
          addon_total: addonTotal,
          prices: { total: finalPrice },
          fade_tiers: FADE_TIERS,
          fade_addons: FADE_ADDONS,
          shipping: { free: true, message: 'FREE shipping included!' },
          formatted: {
            total: `$${finalPrice} (${tier.label}${addonDetails.length ? ' + ' + addonDetails.join(', ') : ''})`
          }
        };
        break;
      }
    }

    console.log(`[cmd-pricing] Final price: $${finalPrice}`);

    return new Response(JSON.stringify({
      success: true,
      product: {
        key: productKey,
        id: productInfo.id,
        name: productInfo.name,
        price_per_unit: productInfo.price,
        type: productInfo.type,
        url: productInfo.url,
        description: productInfo.description
      },
      ...priceBreakdown,
      order_url: productInfo.url,
      upload_url: 'https://weprintwraps.com/pages/upload-artwork',
      all_products: Object.keys(PRODUCTS)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[cmd-pricing] Error:', error);
    return new Response(JSON.stringify({ error: 'Pricing calculation failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

/**
 * AOV Engine - Average Order Value Optimization System
 *
 * Centralizes bundle configurations, upsell logic, volume discount calculations,
 * and product recommendation intelligence to drive AOV from ~$500 to $1,000+.
 *
 * All pricing matches WooCommerce production values.
 */

// ============================================================================
// VOLUME DISCOUNT TIERS (matches website-chat & luigi-ordering-concierge)
// ============================================================================
export const VOLUME_TIERS = [
  { min: 0, max: 499, discount: 0, label: 'Standard', color: '#6B7280' },
  { min: 500, max: 999, discount: 5, label: 'Volume', color: '#3B82F6' },
  { min: 1000, max: 2499, discount: 10, label: 'Bulk', color: '#8B5CF6' },
  { min: 2500, max: 4999, discount: 15, label: 'Fleet', color: '#F59E0B' },
  { min: 5000, max: Infinity, discount: 20, label: 'Enterprise', color: '#10B981' },
] as const;

export type VolumeTier = typeof VOLUME_TIERS[number];

// ============================================================================
// PRODUCT PRICING (matches wpwProducts.ts and WooCommerce)
// ============================================================================
export const PRODUCTS = {
  averyWrap: { id: 79, name: 'Avery MPI 1105 + DOL 1460Z', pricePerSqft: 5.27, category: 'wrap' },
  threeMWrap: { id: 72, name: '3M IJ180Cv3 + 8518', pricePerSqft: 5.27, category: 'wrap' },
  averyContour: { id: 108, name: 'Avery Contour-Cut (Install-Ready)', pricePerSqft: 6.32, category: 'contour' },
  threeMContour: { id: 19420, name: '3M Contour-Cut (Install-Ready)', pricePerSqft: 6.92, category: 'contour' },
  windowPerf: { id: 80, name: 'Perforated Window Vinyl 50/50', pricePerSqft: 5.95, category: 'window' },
  wallWrap: { id: 70093, name: 'Wall Wrap Printed Vinyl', pricePerSqft: 3.25, category: 'wall' },
  customDesign: { id: 234, name: 'Custom Vehicle Wrap Design', price: 750, category: 'design' },
  designDraft: { id: 58160, name: 'Custom Design (Copy/Draft)', price: 500, category: 'design' },
  fadeWrapSmall: { id: 58391, name: 'FadeWraps Small (144x59.5)', price: 600, category: 'fadewrap' },
  fadeWrapMedium: { id: 58391, name: 'FadeWraps Medium (172x59.5)', price: 710, category: 'fadewrap' },
  fadeWrapLarge: { id: 58391, name: 'FadeWraps Large (200x59.5)', price: 825, category: 'fadewrap' },
  fadeWrapXL: { id: 58391, name: 'FadeWraps XL (240x59.5)', price: 990, category: 'fadewrap' },
  inkfusion: { id: 69439, name: 'InkFusion Premium Roll', price: 2075, category: 'inkfusion' },
} as const;

// ============================================================================
// FREE SHIPPING THRESHOLD
// ============================================================================
export const FREE_SHIPPING_THRESHOLD = 750;

// ============================================================================
// AOV TARGET
// ============================================================================
export const AOV_TARGET = 1000;
export const AOV_CURRENT = 500; // approximate baseline

// ============================================================================
// COMMON VEHICLE SQFT ESTIMATES (for bundle calculators)
// ============================================================================
export const VEHICLE_SIZES = {
  compact: { label: 'Compact Car', sqft: 175, examples: 'Civic, Corolla, Prius' },
  midsize: { label: 'Midsize Sedan', sqft: 200, examples: 'Camry, Accord, Altima' },
  fullsize: { label: 'Full-Size Sedan', sqft: 220, examples: 'Charger, 300, Maxima' },
  compactSuv: { label: 'Compact SUV', sqft: 200, examples: 'RAV4, CR-V, Tucson' },
  midsizeSuv: { label: 'Midsize SUV', sqft: 225, examples: 'Explorer, Highlander, Pilot' },
  fullSuv: { label: 'Full-Size SUV', sqft: 275, examples: 'Tahoe, Suburban, Yukon' },
  truck: { label: 'Full-Size Truck', sqft: 250, examples: 'F-150, Silverado, RAM 1500' },
  hdTruck: { label: 'Heavy-Duty Truck', sqft: 275, examples: 'F-250, Silverado 2500' },
  van: { label: 'Cargo Van', sqft: 350, examples: 'Transit, Sprinter, ProMaster' },
  sports: { label: 'Sports Car', sqft: 185, examples: 'Mustang, Camaro, Corvette' },
} as const;

export type VehicleSize = keyof typeof VEHICLE_SIZES;

// ============================================================================
// BUNDLE DEFINITIONS - Pre-configured bundles that push AOV above $1,000
// ============================================================================
export interface BundleConfig {
  id: string;
  name: string;
  description: string;
  tagline: string;
  icon: string; // lucide icon name
  products: Array<{
    productKey: keyof typeof PRODUCTS;
    sqft?: number;
    quantity?: number;
  }>;
  savingsPercent: number; // additional bundle discount
  minOrderValue: number;
  targetAOV: number;
  bestFor: string[];
  popular?: boolean;
}

export const BUNDLES: BundleConfig[] = [
  {
    id: 'full-wrap-premium',
    name: 'Full Wrap + Install-Ready',
    description: 'Full vehicle wrap printed AND contour-cut for seamless installation. Your installers save hours of cutting time.',
    tagline: 'Most Popular - Save install time',
    icon: 'Sparkles',
    products: [
      { productKey: 'averyWrap', sqft: 200 },
      { productKey: 'averyContour', sqft: 200 },
    ],
    savingsPercent: 5,
    minOrderValue: 1000,
    targetAOV: 2200,
    bestFor: ['Wrap Shops', 'Sign Shops', 'Fleet Managers'],
    popular: true,
  },
  {
    id: 'fleet-starter-3',
    name: 'Fleet Starter (3 Vehicles)',
    description: '3 full vehicle wraps with volume pricing. Perfect for small fleet branding projects.',
    tagline: 'Hit the 10% volume tier',
    icon: 'Truck',
    products: [
      { productKey: 'averyWrap', sqft: 600 },
    ],
    savingsPercent: 10,
    minOrderValue: 2500,
    targetAOV: 2850,
    bestFor: ['Fleet Managers', 'Businesses', 'Franchises'],
  },
  {
    id: 'fleet-pro-5',
    name: 'Fleet Pro (5 Vehicles)',
    description: '5 full vehicle wraps with maximum volume pricing. Ideal for fleet branding rollouts.',
    tagline: 'Unlock 15% fleet tier pricing',
    icon: 'Building2',
    products: [
      { productKey: 'averyWrap', sqft: 1000 },
    ],
    savingsPercent: 10,
    minOrderValue: 4000,
    targetAOV: 4740,
    bestFor: ['Fleet Managers', 'Franchises', 'National Brands'],
  },
  {
    id: 'design-print-bundle',
    name: 'Design + Print Bundle',
    description: 'Custom wrap design by our team PLUS full vehicle printing. One stop from concept to print-ready panels.',
    tagline: 'Concept to print in one order',
    icon: 'Palette',
    products: [
      { productKey: 'customDesign' },
      { productKey: 'averyWrap', sqft: 200 },
    ],
    savingsPercent: 5,
    minOrderValue: 1500,
    targetAOV: 1750,
    bestFor: ['New Businesses', 'Rebrand Projects', 'Installers without designers'],
  },
  {
    id: 'wrap-plus-windows',
    name: 'Full Wrap + Window Perf',
    description: 'Complete vehicle coverage including perforated window vinyl. Maximum brand visibility from every angle.',
    tagline: 'Complete vehicle coverage',
    icon: 'Maximize',
    products: [
      { productKey: 'averyWrap', sqft: 200 },
      { productKey: 'windowPerf', sqft: 30 },
    ],
    savingsPercent: 3,
    minOrderValue: 1000,
    targetAOV: 1210,
    bestFor: ['Wrap Shops', 'Fleet Managers', 'Sign Shops'],
  },
  {
    id: 'wall-wrap-commercial',
    name: 'Wall Wrap + Vehicle Combo',
    description: 'Brand your fleet AND your space. Vehicle wrap + wall graphics for complete brand presence.',
    tagline: 'Brand your fleet + your space',
    icon: 'Building',
    products: [
      { productKey: 'averyWrap', sqft: 200 },
      { productKey: 'wallWrap', sqft: 100 },
    ],
    savingsPercent: 5,
    minOrderValue: 1200,
    targetAOV: 1325,
    bestFor: ['Businesses', 'Retail Stores', 'Gyms', 'Restaurants'],
  },
];

// ============================================================================
// UPSELL RECOMMENDATIONS
// ============================================================================
export interface UpsellRecommendation {
  trigger: string; // what the customer is buying
  upsell: string; // what to recommend
  reason: string; // why they should add it
  additionalValue: number; // approximate $ added to order
  priority: 'high' | 'medium' | 'low';
}

export const UPSELL_RULES: UpsellRecommendation[] = [
  {
    trigger: 'wrap',
    upsell: 'Contour-Cut Upgrade',
    reason: 'Save your installers 2-3 hours per vehicle. We cut the panels to shape so they just peel and stick.',
    additionalValue: 400,
    priority: 'high',
  },
  {
    trigger: 'wrap',
    upsell: 'Window Perf Add-On',
    reason: 'Complete the look with rear window coverage. Perforated vinyl maintains visibility from inside.',
    additionalValue: 180,
    priority: 'high',
  },
  {
    trigger: 'wrap',
    upsell: 'Second Vehicle',
    reason: 'Adding a second vehicle drops you into the next volume tier, saving on BOTH vehicles.',
    additionalValue: 1054,
    priority: 'high',
  },
  {
    trigger: 'contour',
    upsell: 'Window Perf',
    reason: 'You already have install-ready panels - add matching window perf for complete coverage.',
    additionalValue: 180,
    priority: 'medium',
  },
  {
    trigger: 'design',
    upsell: 'Design + Print Bundle',
    reason: 'Bundle your design with printing and save 5%. One invoice, one project, faster turnaround.',
    additionalValue: 1054,
    priority: 'high',
  },
  {
    trigger: 'fadewrap',
    upsell: 'Hood Add-On',
    reason: 'Complete the fade effect with a matching hood panel for only $160 more.',
    additionalValue: 160,
    priority: 'medium',
  },
  {
    trigger: 'fadewrap',
    upsell: 'Front Bumper',
    reason: 'Add a coordinated front bumper piece for complete front-end coverage.',
    additionalValue: 200,
    priority: 'low',
  },
  {
    trigger: 'single_vehicle',
    upsell: 'Fleet Pricing',
    reason: 'Got 3+ vehicles? You qualify for fleet pricing with volume discounts up to 20% off.',
    additionalValue: 2000,
    priority: 'high',
  },
  {
    trigger: 'under_750',
    upsell: 'Free Shipping Threshold',
    reason: `You're close to $750 for FREE shipping. Adding a swatch book ($26.50) or bumping up quantity can save you $50+ in shipping.`,
    additionalValue: 50,
    priority: 'medium',
  },
];

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

/**
 * Get the volume discount tier for a given sqft
 */
export function getVolumeTier(sqft: number): VolumeTier {
  return VOLUME_TIERS.find(t => sqft >= t.min && sqft <= t.max) || VOLUME_TIERS[0];
}

/**
 * Get the next volume tier (for upsell nudges)
 */
export function getNextTier(sqft: number): VolumeTier | null {
  const currentIndex = VOLUME_TIERS.findIndex(t => sqft >= t.min && sqft <= t.max);
  if (currentIndex === -1 || currentIndex === VOLUME_TIERS.length - 1) return null;
  return VOLUME_TIERS[currentIndex + 1];
}

/**
 * Calculate sqft needed to reach next tier
 */
export function sqftToNextTier(currentSqft: number): { sqftNeeded: number; tier: VolumeTier } | null {
  const next = getNextTier(currentSqft);
  if (!next) return null;
  return { sqftNeeded: next.min - currentSqft, tier: next };
}

/**
 * Calculate order total with volume discounts
 */
export function calculateOrderTotal(
  sqft: number,
  pricePerSqft: number,
  bundleDiscount: number = 0
): {
  subtotal: number;
  volumeDiscount: number;
  bundleDiscount: number;
  total: number;
  tier: VolumeTier;
  freeShipping: boolean;
  shippingSaved: number;
} {
  const tier = getVolumeTier(sqft);
  const subtotal = sqft * pricePerSqft;
  const volumeDiscountAmount = subtotal * (tier.discount / 100);
  const afterVolume = subtotal - volumeDiscountAmount;
  const bundleDiscountAmount = afterVolume * (bundleDiscount / 100);
  const total = afterVolume - bundleDiscountAmount;
  const freeShipping = total >= FREE_SHIPPING_THRESHOLD;

  return {
    subtotal,
    volumeDiscount: volumeDiscountAmount,
    bundleDiscount: bundleDiscountAmount,
    total,
    tier,
    freeShipping,
    shippingSaved: freeShipping ? 65 : 0, // avg shipping cost
  };
}

/**
 * Calculate bundle price
 */
export function calculateBundlePrice(bundle: BundleConfig, vehicleSqft: number = 200): {
  itemizedTotal: number;
  bundleTotal: number;
  savings: number;
  perVehicle: number;
  freeShipping: boolean;
} {
  let itemizedTotal = 0;
  let totalSqft = 0;

  for (const item of bundle.products) {
    const product = PRODUCTS[item.productKey];
    if ('pricePerSqft' in product) {
      const sqft = item.sqft || vehicleSqft;
      totalSqft += sqft;
      itemizedTotal += sqft * product.pricePerSqft;
    } else if ('price' in product) {
      itemizedTotal += product.price * (item.quantity || 1);
    }
  }

  // Apply volume discount based on total sqft
  const tier = getVolumeTier(totalSqft);
  const afterVolume = itemizedTotal * (1 - tier.discount / 100);

  // Apply bundle discount
  const bundleTotal = afterVolume * (1 - bundle.savingsPercent / 100);
  const savings = itemizedTotal - bundleTotal;

  // Estimate per-vehicle cost
  const vehicleCount = Math.max(1, Math.floor(totalSqft / vehicleSqft));
  const perVehicle = bundleTotal / vehicleCount;
  const freeShipping = bundleTotal >= FREE_SHIPPING_THRESHOLD;

  return { itemizedTotal, bundleTotal, savings, perVehicle, freeShipping };
}

/**
 * Get relevant upsells based on current cart/quote context
 */
export function getRelevantUpsells(
  currentProducts: string[],
  orderTotal: number
): UpsellRecommendation[] {
  const upsells: UpsellRecommendation[] = [];

  for (const rule of UPSELL_RULES) {
    // Check if any trigger matches current products
    const hasMatch = currentProducts.some(p =>
      p.toLowerCase().includes(rule.trigger.toLowerCase())
    );

    // Special triggers
    if (rule.trigger === 'under_750' && orderTotal < FREE_SHIPPING_THRESHOLD) {
      upsells.push(rule);
      continue;
    }

    if (rule.trigger === 'single_vehicle' && currentProducts.length <= 1) {
      upsells.push(rule);
      continue;
    }

    if (hasMatch) {
      upsells.push(rule);
    }
  }

  return upsells.sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return priority[a.priority] - priority[b.priority];
  });
}

/**
 * Calculate what it takes to reach AOV target
 */
export function getAOVGapAnalysis(currentOrderValue: number): {
  gap: number;
  percentOfTarget: number;
  suggestions: string[];
} {
  const gap = Math.max(0, AOV_TARGET - currentOrderValue);
  const percentOfTarget = Math.min(100, (currentOrderValue / AOV_TARGET) * 100);

  const suggestions: string[] = [];

  if (gap > 0) {
    if (gap <= 200) {
      suggestions.push('Add window perf or a swatch book to cross the $1,000 mark');
    }
    if (gap <= 400) {
      suggestions.push('Upgrade to contour-cut panels for install-ready convenience');
    }
    if (gap > 400) {
      suggestions.push('Add a second vehicle to unlock volume discount pricing');
      suggestions.push('Bundle design services with your print order');
    }
    if (currentOrderValue < FREE_SHIPPING_THRESHOLD) {
      suggestions.push(`Add $${(FREE_SHIPPING_THRESHOLD - currentOrderValue).toFixed(0)} to qualify for FREE shipping`);
    }
  }

  return { gap, percentOfTarget, suggestions };
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format currency with cents
 */
export function formatCurrencyExact(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

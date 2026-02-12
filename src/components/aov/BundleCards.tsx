/**
 * Bundle Cards
 *
 * Displays pre-configured product bundles that push AOV above $1,000.
 * Each card shows itemized pricing, savings, and a clear CTA.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sparkles, Truck, Building2, Palette, Maximize, Building,
  ChevronDown, ChevronUp, Check, Star, ArrowRight, Copy
} from "lucide-react";
import { toast } from "sonner";
import {
  BUNDLES,
  PRODUCTS,
  VEHICLE_SIZES,
  calculateBundlePrice,
  formatCurrency,
  type BundleConfig,
  type VehicleSize,
} from "@/lib/aovEngine";

const MAGENTA = "#E91E8C";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Truck, Building2, Palette, Maximize, Building,
};

function BundleCard({ bundle, vehicleSqft }: { bundle: BundleConfig; vehicleSqft: number }) {
  const [expanded, setExpanded] = useState(false);
  const pricing = calculateBundlePrice(bundle, vehicleSqft);
  const Icon = ICON_MAP[bundle.icon] || Sparkles;

  const copyBundleInfo = () => {
    const text = [
      `${bundle.name}`,
      `${bundle.description}`,
      ``,
      `Retail: ${formatCurrency(pricing.itemizedTotal)}`,
      `Bundle Price: ${formatCurrency(pricing.bundleTotal)}`,
      `You Save: ${formatCurrency(pricing.savings)}`,
      pricing.freeShipping ? `FREE shipping included` : '',
      ``,
      `Products:`,
      ...bundle.products.map(p => {
        const product = PRODUCTS[p.productKey];
        return `- ${product.name}${p.sqft ? ` (${p.sqft} sqft)` : ''}`;
      }),
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    toast.success('Bundle details copied to clipboard');
  };

  return (
    <Card className={`bg-[#111318] border-white/10 overflow-hidden transition-all hover:border-white/20 ${
      bundle.popular ? 'ring-1' : ''
    }`} style={bundle.popular ? { ringColor: MAGENTA + '60' } : {}}>
      {bundle.popular && (
        <div
          className="px-3 py-1 text-xs font-semibold text-white text-center"
          style={{ background: `linear-gradient(90deg, ${MAGENTA}, #9D4EDD)` }}
        >
          <Star className="h-3 w-3 inline mr-1" />
          Most Popular Bundle
        </div>
      )}
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ background: MAGENTA + '20' }}
            >
              <Icon className="h-5 w-5" style={{ color: MAGENTA }} />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">{bundle.name}</h3>
              <p className="text-xs text-gray-400">{bundle.tagline}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-green-400 border-green-400/30 text-xs">
            Save {formatCurrency(pricing.savings)}
          </Badge>
        </div>

        <p className="text-sm text-gray-300 mb-4">{bundle.description}</p>

        {/* Pricing */}
        <div className="bg-white/5 rounded-lg p-3 mb-4 space-y-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Individual pricing</span>
            <span className="line-through">{formatCurrency(pricing.itemizedTotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-white font-semibold">Bundle Price</span>
            <span className="text-lg font-bold text-white">{formatCurrency(pricing.bundleTotal)}</span>
          </div>
          {pricing.freeShipping && (
            <div className="flex items-center gap-1 text-green-400 text-xs">
              <Truck className="h-3 w-3" />
              FREE shipping
            </div>
          )}
        </div>

        {/* Best For */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {bundle.bestFor.map(tag => (
            <Badge key={tag} variant="secondary" className="text-[10px] bg-white/5 text-gray-300 border-0">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Expanded Details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors mb-3"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Hide' : 'Show'} product breakdown
        </button>

        {expanded && (
          <div className="bg-white/5 rounded-lg p-3 mb-4 space-y-2">
            {bundle.products.map((item, i) => {
              const product = PRODUCTS[item.productKey];
              const itemPrice = 'pricePerSqft' in product
                ? (item.sqft || vehicleSqft) * product.pricePerSqft
                : product.price * (item.quantity || 1);
              return (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-gray-300">
                    {product.name}
                    {item.sqft ? ` (${item.sqft} sqft)` : ''}
                  </span>
                  <span className="text-gray-400">{formatCurrency(itemPrice)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={copyBundleInfo}
            variant="outline"
            size="sm"
            className="flex-1 border-white/10 text-gray-300 hover:text-white text-xs"
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy for Quote
          </Button>
          <Button
            size="sm"
            className="flex-1 text-white text-xs"
            style={{ background: MAGENTA }}
          >
            <ArrowRight className="h-3 w-3 mr-1" />
            Use Bundle
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function BundleCards() {
  const [vehicleSize, setVehicleSize] = useState<VehicleSize>('midsize');
  const vehicleSqft = VEHICLE_SIZES[vehicleSize].sqft;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Pre-Built Bundles</h2>
          <p className="text-sm text-gray-400">Ready-to-quote bundles that push orders above $1,000</p>
        </div>
        <div className="w-48">
          <Select value={vehicleSize} onValueChange={(v) => setVehicleSize(v as VehicleSize)}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(VEHICLE_SIZES).map(([key, v]) => (
                <SelectItem key={key} value={key}>
                  {v.label} ({v.sqft} sqft)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {BUNDLES.map(bundle => (
          <BundleCard key={bundle.id} bundle={bundle} vehicleSqft={vehicleSqft} />
        ))}
      </div>
    </div>
  );
}

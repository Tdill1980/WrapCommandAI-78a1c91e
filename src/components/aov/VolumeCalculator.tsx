/**
 * Volume Savings Calculator
 *
 * Interactive calculator showing cost savings at each volume tier.
 * Designed to nudge customers toward higher-value orders by visualizing
 * the $ savings at the next tier.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Truck, ArrowRight, Check } from "lucide-react";
import {
  VOLUME_TIERS,
  PRODUCTS,
  VEHICLE_SIZES,
  calculateOrderTotal,
  sqftToNextTier,
  formatCurrency,
  FREE_SHIPPING_THRESHOLD,
  type VehicleSize,
} from "@/lib/aovEngine";

const MAGENTA = "#E91E8C";

export function VolumeCalculator() {
  const [sqft, setSqft] = useState(200);
  const [material, setMaterial] = useState<'averyWrap' | 'threeMWrap' | 'averyContour' | 'threeMContour'>('averyWrap');
  const [vehicleType, setVehicleType] = useState<VehicleSize>('midsize');

  const product = PRODUCTS[material];
  const pricePerSqft = 'pricePerSqft' in product ? product.pricePerSqft : 5.27;
  const result = calculateOrderTotal(sqft, pricePerSqft);
  const nextTier = sqftToNextTier(sqft);

  const handleVehicleChange = (value: string) => {
    const size = value as VehicleSize;
    setVehicleType(size);
    setSqft(VEHICLE_SIZES[size].sqft);
  };

  return (
    <Card className="bg-[#111318] border-white/10">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <TrendingUp className="h-5 w-5" style={{ color: MAGENTA }} />
          Volume Savings Calculator
        </CardTitle>
        <p className="text-sm text-gray-400">
          See how volume pricing drops your cost per sqft
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Material Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Material</label>
            <Select value={material} onValueChange={(v) => setMaterial(v as typeof material)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="averyWrap">Avery MPI 1105 - $5.27/sqft</SelectItem>
                <SelectItem value="threeMWrap">3M IJ180Cv3 - $5.27/sqft</SelectItem>
                <SelectItem value="averyContour">Avery Contour-Cut - $6.32/sqft</SelectItem>
                <SelectItem value="threeMContour">3M Contour-Cut - $6.92/sqft</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Vehicle Size Preset</label>
            <Select value={vehicleType} onValueChange={handleVehicleChange}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
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

        {/* Sqft Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-400">Total Square Footage</label>
            <span className="text-lg font-bold text-white">{sqft.toLocaleString()} sqft</span>
          </div>
          <Slider
            value={[sqft]}
            onValueChange={([v]) => setSqft(v)}
            min={50}
            max={6000}
            step={25}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>50</span>
            <span>500</span>
            <span>1,000</span>
            <span>2,500</span>
            <span>5,000+</span>
          </div>
        </div>

        {/* Tier Visualization */}
        <div className="grid grid-cols-5 gap-1">
          {VOLUME_TIERS.map((tier) => {
            const isActive = sqft >= tier.min && sqft <= tier.max;
            const isPast = sqft > tier.max;
            return (
              <div
                key={tier.label}
                className={`rounded-lg p-2 text-center transition-all ${
                  isActive
                    ? 'bg-white/10 ring-1 ring-white/30 scale-105'
                    : isPast
                    ? 'bg-white/5 opacity-50'
                    : 'bg-white/5 opacity-70'
                }`}
              >
                <div className="text-[10px] text-gray-400">{tier.label}</div>
                <div
                  className="text-sm font-bold"
                  style={{ color: isActive ? tier.color : '#6B7280' }}
                >
                  {tier.discount}% off
                </div>
                <div className="text-[10px] text-gray-500">
                  {tier.min === 5000 ? '5000+' : `${tier.min}-${tier.max}`}
                </div>
                {isActive && (
                  <Check className="h-3 w-3 mx-auto mt-1" style={{ color: tier.color }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Results */}
        <div className="bg-white/5 rounded-xl p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Subtotal ({sqft} sqft x ${pricePerSqft}/sqft)</span>
            <span className="text-white">{formatCurrency(result.subtotal)}</span>
          </div>
          {result.volumeDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-400">Volume Discount ({result.tier.discount}%)</span>
              <span className="text-green-400">-{formatCurrency(result.volumeDiscount)}</span>
            </div>
          )}
          <div className="border-t border-white/10 pt-2 flex justify-between">
            <span className="text-white font-semibold">Total</span>
            <span className="text-xl font-bold text-white">{formatCurrency(result.total)}</span>
          </div>
          {result.freeShipping && (
            <div className="flex items-center gap-1.5 text-green-400 text-sm">
              <Truck className="h-4 w-4" />
              FREE shipping included (saving ~$65)
            </div>
          )}
          {!result.freeShipping && (
            <div className="text-xs text-yellow-400/80">
              Add {formatCurrency(FREE_SHIPPING_THRESHOLD - result.total)} more for FREE shipping
            </div>
          )}
        </div>

        {/* Next Tier Nudge */}
        {nextTier && (
          <div
            className="rounded-xl p-4 border border-dashed"
            style={{ borderColor: nextTier.tier.color + '40', background: nextTier.tier.color + '08' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <ArrowRight className="h-4 w-4" style={{ color: nextTier.tier.color }} />
              <span className="text-sm font-semibold text-white">
                Add {nextTier.sqftNeeded} sqft to unlock {nextTier.tier.label} pricing
              </span>
            </div>
            <p className="text-xs text-gray-400">
              That's roughly {Math.ceil(nextTier.sqftNeeded / 200)} more vehicle(s). You'd save an
              extra {nextTier.tier.discount - result.tier.discount}% on your entire order.
            </p>
            <div className="mt-2 text-xs" style={{ color: nextTier.tier.color }}>
              Potential savings: {formatCurrency(result.subtotal * ((nextTier.tier.discount - result.tier.discount) / 100))} more
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

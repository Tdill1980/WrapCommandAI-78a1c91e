/**
 * Fleet Quote Builder
 *
 * Interactive tool for building fleet wrap quotes.
 * Automatically applies volume tier pricing and shows per-vehicle savings.
 * Key AOV driver - fleet orders are typically $2,500-$15,000+.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Truck, Plus, Trash2, Copy, Calculator, Check, ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import {
  PRODUCTS,
  VEHICLE_SIZES,
  VOLUME_TIERS,
  calculateOrderTotal,
  getVolumeTier,
  sqftToNextTier,
  formatCurrency,
  formatCurrencyExact,
  FREE_SHIPPING_THRESHOLD,
  type VehicleSize,
} from "@/lib/aovEngine";

const MAGENTA = "#E91E8C";

interface FleetVehicle {
  id: string;
  type: VehicleSize;
  quantity: number;
  material: 'averyWrap' | 'threeMWrap' | 'averyContour' | 'threeMContour';
  addWindowPerf: boolean;
}

const defaultVehicle = (): FleetVehicle => ({
  id: crypto.randomUUID(),
  type: 'truck',
  quantity: 1,
  material: 'averyWrap',
  addWindowPerf: false,
});

export function FleetQuoteBuilder() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([defaultVehicle()]);
  const [companyName, setCompanyName] = useState('');

  const addVehicle = () => setVehicles([...vehicles, defaultVehicle()]);
  const removeVehicle = (id: string) => setVehicles(vehicles.filter(v => v.id !== id));
  const updateVehicle = (id: string, updates: Partial<FleetVehicle>) => {
    setVehicles(vehicles.map(v => v.id === id ? { ...v, ...updates } : v));
  };

  // Calculate totals
  const totalVehicles = vehicles.reduce((sum, v) => sum + v.quantity, 0);
  const totalSqft = vehicles.reduce((sum, v) => {
    const sqft = VEHICLE_SIZES[v.type].sqft * v.quantity;
    const windowSqft = v.addWindowPerf ? 30 * v.quantity : 0;
    return sum + sqft + windowSqft;
  }, 0);

  const tier = getVolumeTier(totalSqft);
  const nextTier = sqftToNextTier(totalSqft);

  // Calculate line items
  const lineItems = vehicles.map(v => {
    const product = PRODUCTS[v.material];
    const sqft = VEHICLE_SIZES[v.type].sqft * v.quantity;
    const pricePerSqft = 'pricePerSqft' in product ? product.pricePerSqft : 5.27;
    const wrapCost = sqft * pricePerSqft;
    const windowCost = v.addWindowPerf ? 30 * v.quantity * 5.95 : 0;
    return {
      ...v,
      sqft,
      wrapCost,
      windowCost,
      total: wrapCost + windowCost,
    };
  });

  const subtotal = lineItems.reduce((sum, l) => sum + l.total, 0);
  const volumeDiscount = subtotal * (tier.discount / 100);
  const grandTotal = subtotal - volumeDiscount;
  const freeShipping = grandTotal >= FREE_SHIPPING_THRESHOLD;
  const perVehicle = totalVehicles > 0 ? grandTotal / totalVehicles : 0;

  const copyQuote = () => {
    const lines = [
      companyName ? `Fleet Quote for: ${companyName}` : 'Fleet Quote',
      '═'.repeat(40),
      '',
      ...lineItems.map(l => {
        const vehicleInfo = VEHICLE_SIZES[l.type];
        const product = PRODUCTS[l.material];
        return [
          `${l.quantity}x ${vehicleInfo.label} — ${product.name}`,
          `   ${l.sqft} sqft @ $${('pricePerSqft' in product ? product.pricePerSqft : 5.27)}/sqft = ${formatCurrency(l.wrapCost)}`,
          l.addWindowPerf ? `   + Window Perf: ${30 * l.quantity} sqft @ $5.95/sqft = ${formatCurrency(l.windowCost)}` : '',
        ].filter(Boolean).join('\n');
      }),
      '',
      '─'.repeat(40),
      `Subtotal: ${formatCurrency(subtotal)}`,
      tier.discount > 0 ? `Volume Discount (${tier.label} — ${tier.discount}%): -${formatCurrency(volumeDiscount)}` : '',
      `TOTAL: ${formatCurrency(grandTotal)}`,
      `Per Vehicle: ${formatCurrency(perVehicle)}`,
      freeShipping ? 'FREE shipping included' : '',
      '',
      `Total Vehicles: ${totalVehicles}`,
      `Total Square Footage: ${totalSqft.toLocaleString()} sqft`,
      `Volume Tier: ${tier.label} (${tier.discount}% off)`,
      '',
      'WePrintWraps.com | 602-595-3200',
      'Ships in 1-2 business days nationwide',
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines);
    toast.success('Fleet quote copied to clipboard');
  };

  return (
    <Card className="bg-[#111318] border-white/10">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Truck className="h-5 w-5" style={{ color: MAGENTA }} />
          Fleet Quote Builder
        </CardTitle>
        <p className="text-sm text-gray-400">
          Build multi-vehicle quotes with automatic volume tier pricing
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Company Name */}
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Company / Customer Name</label>
          <Input
            placeholder="Enter company name..."
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className="bg-white/5 border-white/10 text-white"
          />
        </div>

        {/* Vehicle Lines */}
        <div className="space-y-3">
          {vehicles.map((vehicle, i) => (
            <div key={vehicle.id} className="bg-white/5 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Vehicle {i + 1}</span>
                {vehicles.length > 1 && (
                  <button
                    onClick={() => removeVehicle(vehicle.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Vehicle Type</label>
                  <Select
                    value={vehicle.type}
                    onValueChange={v => updateVehicle(vehicle.id, { type: v as VehicleSize })}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(VEHICLE_SIZES).map(([key, v]) => (
                        <SelectItem key={key} value={key}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Quantity</label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={vehicle.quantity}
                    onChange={e => updateVehicle(vehicle.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="bg-white/5 border-white/10 text-white text-xs h-8"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Material</label>
                  <Select
                    value={vehicle.material}
                    onValueChange={v => updateVehicle(vehicle.id, { material: v as FleetVehicle['material'] })}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="averyWrap">Avery MPI 1105</SelectItem>
                      <SelectItem value="threeMWrap">3M IJ180Cv3</SelectItem>
                      <SelectItem value="averyContour">Avery Contour</SelectItem>
                      <SelectItem value="threeMContour">3M Contour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vehicle.addWindowPerf}
                      onChange={e => updateVehicle(vehicle.id, { addWindowPerf: e.target.checked })}
                      className="rounded border-white/20"
                    />
                    <span className="text-[10px] text-gray-400">+ Window Perf</span>
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={addVehicle}
          className="w-full border-dashed border-white/20 text-gray-400 hover:text-white text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Vehicle Line
        </Button>

        {/* Summary */}
        <div className="bg-white/5 rounded-xl p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Vehicles</span>
            <span className="text-white">{totalVehicles}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total Sqft</span>
            <span className="text-white">{totalSqft.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Volume Tier</span>
            <Badge style={{ background: tier.color + '20', color: tier.color }} className="border-0 text-xs">
              {tier.label} ({tier.discount}% off)
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Subtotal</span>
            <span className="text-white">{formatCurrency(subtotal)}</span>
          </div>
          {volumeDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-400">Volume Savings</span>
              <span className="text-green-400">-{formatCurrency(volumeDiscount)}</span>
            </div>
          )}
          <div className="border-t border-white/10 pt-2 flex justify-between">
            <span className="text-white font-semibold">Grand Total</span>
            <span className="text-xl font-bold text-white">{formatCurrency(grandTotal)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Per Vehicle</span>
            <span className="text-gray-300">{formatCurrency(perVehicle)}</span>
          </div>
          {freeShipping && (
            <div className="flex items-center gap-1 text-green-400 text-xs">
              <Check className="h-3 w-3" /> FREE shipping included
            </div>
          )}
        </div>

        {/* Next Tier Nudge */}
        {nextTier && (
          <div
            className="rounded-lg p-3 border border-dashed"
            style={{ borderColor: nextTier.tier.color + '40', background: nextTier.tier.color + '08' }}
          >
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4" style={{ color: nextTier.tier.color }} />
              <span className="text-xs text-white">
                Add {nextTier.sqftNeeded} sqft ({Math.ceil(nextTier.sqftNeeded / 200)} vehicle{Math.ceil(nextTier.sqftNeeded / 200) > 1 ? 's' : ''}) to unlock <strong>{nextTier.tier.label}</strong> tier ({nextTier.tier.discount}% off)
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={copyQuote}
            className="flex-1 text-white"
            style={{ background: MAGENTA }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Fleet Quote
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

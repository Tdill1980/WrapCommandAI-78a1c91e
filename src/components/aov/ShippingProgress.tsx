/**
 * Free Shipping Progress Bar
 *
 * Visual indicator showing proximity to the $750 free shipping threshold.
 * Designed to be embedded in quote emails, chat, and the AOV dashboard.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Truck, Check, ArrowRight } from "lucide-react";
import { FREE_SHIPPING_THRESHOLD, formatCurrency } from "@/lib/aovEngine";

const MAGENTA = "#E91E8C";

interface ShippingProgressProps {
  orderTotal: number;
  compact?: boolean;
}

export function ShippingProgress({ orderTotal, compact = false }: ShippingProgressProps) {
  const progress = Math.min(100, (orderTotal / FREE_SHIPPING_THRESHOLD) * 100);
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - orderTotal);
  const qualifies = orderTotal >= FREE_SHIPPING_THRESHOLD;

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          {qualifies ? (
            <span className="text-green-400 flex items-center gap-1">
              <Check className="h-3 w-3" /> FREE shipping
            </span>
          ) : (
            <span className="text-gray-400">
              {formatCurrency(remaining)} away from free shipping
            </span>
          )}
          <span className="text-gray-500">{formatCurrency(FREE_SHIPPING_THRESHOLD)}</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>
    );
  }

  return (
    <Card className="bg-[#111318] border-white/10">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center ${
              qualifies ? 'bg-green-500/20' : 'bg-white/10'
            }`}
          >
            <Truck className={`h-4 w-4 ${qualifies ? 'text-green-400' : 'text-gray-400'}`} />
          </div>
          <div>
            {qualifies ? (
              <div>
                <span className="text-green-400 font-semibold text-sm">FREE Shipping Unlocked</span>
                <p className="text-xs text-gray-400">Saving ~$65 on this order</p>
              </div>
            ) : (
              <div>
                <span className="text-white font-semibold text-sm">
                  {formatCurrency(remaining)} to FREE shipping
                </span>
                <p className="text-xs text-gray-400">
                  Orders over {formatCurrency(FREE_SHIPPING_THRESHOLD)} ship free nationwide
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{formatCurrency(orderTotal)}</span>
            <span>{formatCurrency(FREE_SHIPPING_THRESHOLD)}</span>
          </div>
          <div className="relative">
            <Progress value={progress} className="h-2" />
            {!qualifies && progress > 20 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center"
                style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
              >
                <ArrowRight className="h-2 w-2 text-white" />
              </div>
            )}
          </div>
        </div>

        {!qualifies && remaining < 200 && (
          <div className="mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
            <p className="text-xs text-yellow-400">
              You're close! Add a swatch book ($26.50) or bump quantity to save ~$65 in shipping.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

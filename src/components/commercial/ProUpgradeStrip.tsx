import { Rocket, ChevronRight } from "lucide-react";
import logoRestylepro from "@/assets/commercial/logo-restylepro.png";

// Environment variables for Pro URLs
const COMMERCIALPRO_URL = import.meta.env.VITE_COMMERCIALPRO_URL || "#";
const RESTYLEPRO_URL = import.meta.env.VITE_RESTYLEPRO_URL || "https://restyleproai.com/";

interface ProUpgradeStripProps {
  className?: string;
  variant?: "light" | "dark";
}

export const ProUpgradeStrip = ({
  className = "",
  variant = "light",
}: ProUpgradeStripProps) => {
  const bgClass = variant === "dark"
    ? "bg-slate-900 border-slate-800"
    : "bg-card border-border";

  const cardBgClass = variant === "dark"
    ? "bg-slate-800/50 border-slate-700 hover:bg-slate-800"
    : "bg-background border-border hover:bg-muted/50";

  return (
    <div className={`${bgClass} border rounded-xl p-6 ${className}`}>
      <div className="grid md:grid-cols-2 gap-4">
        {/* CommercialPro Card */}
        <a
          href={COMMERCIALPRO_URL}
          className={`${cardBgClass} border rounded-lg p-5 transition-colors group`}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`font-semibold ${variant === "dark" ? "text-white" : "text-foreground"}`}>
                  CommercialPro
                </h3>
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                  Pro Account
                </span>
              </div>
              <p className={`text-sm mb-2 ${variant === "dark" ? "text-slate-300" : "text-muted-foreground"}`}>
                Tracking + saved quotes + ApprovePro 3D proof upgrades.
              </p>
              <p className={`text-xs ${variant === "dark" ? "text-slate-400" : "text-muted-foreground/80"}`}>
                Make your proof look premium — even without a printer.
              </p>
              <div className="flex items-center gap-1 mt-3 text-primary text-sm font-medium">
                Unlock CommercialPro
                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </a>

        {/* RestylePro Card */}
        <a
          href={RESTYLEPRO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${cardBgClass} border rounded-lg p-5 transition-colors group`}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors overflow-hidden">
              <img
                src={logoRestylepro}
                alt="RestylePro"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`font-semibold ${variant === "dark" ? "text-white" : "text-foreground"}`}>
                  RestylePro
                </h3>
                <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded">
                  Premium Restyle
                </span>
              </div>
              <p className={`text-sm mb-2 ${variant === "dark" ? "text-slate-300" : "text-muted-foreground"}`}>
                6-angle proof renders built for high-end restyle work.
              </p>
              <p className={`text-xs ${variant === "dark" ? "text-slate-400" : "text-muted-foreground/80"}`}>
                Premium visual proofs for show cars and luxury vehicles.
              </p>
              <div className="flex items-center gap-1 mt-3 text-accent text-sm font-medium">
                Explore RestylePro
                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </a>
      </div>
    </div>
  );
};

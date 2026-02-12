import { Sparkles, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import proof2d from "@/assets/commercial/approvepro-2d-proof.png";
import proof3d from "@/assets/commercial/approvepro-3d-proof.png";

export const ApproveProTeaser = () => {
  const scrollToProofing = () => {
    const section = document.getElementById("proofing");
    if (section) {
      section.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-xl p-6 border border-blue-500/20 shadow-lg shadow-blue-500/5">
      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Mini proof preview */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="relative">
            <img
              src={proof2d}
              alt="2D flat proof"
              className="w-16 h-16 md:w-20 md:h-20 rounded-lg object-cover border border-border/20 opacity-60"
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-muted-foreground/50 rounded-full flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">2D</span>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <div className="relative">
            <img
              src={proof3d}
              alt="3D photorealistic proof"
              className="w-16 h-16 md:w-20 md:h-20 rounded-lg object-cover border-2 border-primary shadow-md shadow-primary/30"
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
              <span className="text-[10px] font-bold text-primary-foreground">3D</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 text-center md:text-left">
          <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-white">
              Photorealistic 3D Proof Included
            </h3>
          </div>
          <p className="text-blue-200/80 text-sm leading-relaxed">
            Turn your janky 2D proof into a client-ready 3D render.
            <span className="hidden sm:inline"> Fewer revisions. Faster approvals. Bigger-ticket confidence.</span>
          </p>
        </div>

        {/* CTA */}
        <div className="flex-shrink-0">
          <button
            onClick={scrollToProofing}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg text-primary font-medium text-sm transition-colors"
          >
            See before/after
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

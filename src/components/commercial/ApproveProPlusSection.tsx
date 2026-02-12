import { Layers, Eye, Building2, Camera, CheckCircle, FileImage, ArrowRight, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import proof2D from "@/assets/commercial/approvepro-2d-proof.png";
import proof3D from "@/assets/commercial/approvepro-3d-proof.png";

/**
 * ApproveProPlusSection
 *
 * Explainer section for CommercialPro's ApprovePro Plus 2D→3D proof system.
 * Visual placeholder included — swap imagery as needed.
 *
 * Standalone, modular component for WePrintWraps CommercialPro.
 */

const WHATS_INCLUDED = [
  {
    icon: Camera,
    text: "1 photorealistic 3D Commercial Proof per job",
  },
  {
    icon: FileImage,
    text: "Generated from a provided or approved 2D design",
  },
  {
    icon: Eye,
    text: "Front, rear, driver, and passenger views",
  },
  {
    icon: Layers,
    text: "Accurate proportions and lighting",
  },
  {
    icon: Building2,
    text: "Client or shop branding locked in the bottom-right corner",
  },
  {
    icon: CheckCircle,
    text: "Approval-ready presentation for stakeholders",
  },
];

const IMPORTANT_NOTES = [
  "A 2D wrap design is required to generate an ApprovePro Plus proof",
  "ApprovePro Plus does not create or redesign artwork",
  "The 3D proof is used for visual approval, not creative development",
];

export const ApproveProPlusSection = () => {
  return (
    <section className="w-full bg-background py-16">
      <div className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-medium tracking-widest uppercase text-primary mb-3">
            CommercialPro Feature
          </span>
          <h2 className="text-3xl font-semibold text-foreground mb-4">
            ApprovePro Plus™ (Included with CommercialPro)
          </h2>
          <div className="text-muted-foreground max-w-3xl mx-auto space-y-4">
            <p>
              Every CommercialPro wrap order includes ApprovePro Plus™ — a 2D-to-3D
              photorealistic commercial approval proof generated from your submitted
              or approved 2D wrap design.
            </p>
            <p>
              ApprovePro Plus converts an existing 2D layout into a realistic 3D vehicle
              preview, showing all primary sides so decision-makers can clearly visualize
              the final result before production.
            </p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Visual Placeholder */}
          <div className="space-y-6">
            {/* 2D Proof - Before */}
            <div className="relative">
              <div className="absolute -top-3 left-4 z-10">
                <span className="bg-muted text-muted-foreground text-xs font-medium px-3 py-1 rounded-full border border-border">
                  BEFORE — 2D Proof
                </span>
              </div>
              <div className="aspect-[16/10] rounded-xl border border-border overflow-hidden bg-muted">
                <img
                  src={proof2D}
                  alt="2D wrap proof layout with measurements"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="flex items-center gap-2 text-primary">
                <ArrowRight className="w-5 h-5 rotate-90" />
                <span className="text-sm font-medium">Transforms to</span>
                <ArrowRight className="w-5 h-5 rotate-90" />
              </div>
            </div>

            {/* 3D Proof - After */}
            <div className="relative">
              <div className="absolute -top-3 left-4 z-10">
                <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                  AFTER — 3D ApprovePro Plus™
                </span>
              </div>
              <div className="aspect-[16/10] rounded-xl border border-border overflow-hidden shadow-lg">
                <img
                  src={proof3D}
                  alt="Photorealistic 3D vehicle wrap proof"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* What's Included List */}
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">
                What's Included
              </h3>
              <div className="space-y-4">
                {WHATS_INCLUDED.map((item) => (
                  <div key={item.text} className="flex gap-3 items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                      <item.icon className="w-4 h-4 text-secondary-foreground" />
                    </div>
                    <p className="text-sm text-foreground pt-1">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Important to Know */}
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <h4 className="text-sm font-medium text-foreground mb-3">
                Important to Know
              </h4>
              <ul className="space-y-2">
                {IMPORTANT_NOTES.map((note) => (
                  <li key={note} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-primary">•</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Footer Note + CTA */}
        <div className="mt-12 text-center space-y-6">
          <p className="text-xs text-muted-foreground">
            One ApprovePro Plus 3D commercial proof is included per CommercialPro job.
            Additional views or versions are available if needed.
          </p>
          <Button asChild size="lg">
            <Link to="/approvepro">
              Request 3D Proof
              <ChevronRight className="w-5 h-5 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default ApproveProPlusSection;

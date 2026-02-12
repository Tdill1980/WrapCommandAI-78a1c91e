import logo3m from "@/assets/commercial/logo-3m.png";
import logoAvery from "@/assets/commercial/logo-avery-dennison.png";
import logoHpLatex from "@/assets/commercial/logo-hp-latex.png";
import logoEpson from "@/assets/commercial/logo-epson.png";

interface TrustLogosStripProps {
  className?: string;
}

const MANUFACTURER_LOGOS = [
  { src: logo3m, alt: "3M", width: 60 },
  { src: logoAvery, alt: "Avery Dennison", width: 100 },
  { src: logoHpLatex, alt: "HP Latex", width: 80 },
  { src: logoEpson, alt: "Epson", width: 70 },
];

export const TrustLogosStrip = ({ className = "" }: TrustLogosStripProps) => {
  return (
    <section className={`bg-muted/30 border-y border-border py-8 ${className}`}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col items-center gap-6">
          {/* Header text */}
          <p className="text-sm text-muted-foreground text-center">
            Printed using premium equipment & materials
          </p>

          {/* Logos row */}
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {MANUFACTURER_LOGOS.map((logo) => (
              <div
                key={logo.alt}
                className="grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all duration-300"
              >
                <img
                  src={logo.src}
                  alt={logo.alt}
                  style={{ width: logo.width, height: "auto" }}
                  className="object-contain max-h-10"
                />
              </div>
            ))}
          </div>

          {/* Legal disclaimer */}
          <p className="text-[10px] text-muted-foreground/60 text-center">
            Logos are trademarks of their respective owners. Used to indicate materials/equipment used.
          </p>
        </div>
      </div>
    </section>
  );
};

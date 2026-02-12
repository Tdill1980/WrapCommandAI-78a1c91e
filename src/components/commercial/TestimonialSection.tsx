import { Play, Quote, TrendingUp, Truck, Ruler } from "lucide-react";
import testimonialGhostIndustries from "@/assets/commercial/testimonial-ghost-industries.png";
import premiumGuaranteeBadge from "@/assets/commercial/premium-wrap-guarantee-gold.png";

export const TestimonialSection = () => {
  return (
    <section className="bg-navy py-16 lg:py-20">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Success Stories
          </h2>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">
            See how professionals supercharge their growth with WePrintWraps
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Erik's Video Testimonial */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10">
            {/* Video Area */}
            <div className="relative aspect-video bg-gradient-to-br from-navy-800 to-navy-900">
              {/* Video Placeholder - replace with actual embed */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 cursor-pointer hover:scale-110 transition-transform shadow-lg shadow-primary/30">
                    <Play className="h-8 w-8 text-white ml-1" fill="currentColor" />
                  </div>
                  <p className="text-white/60 text-sm">Watch Erik's Story</p>
                </div>
              </div>

              {/* Fleet Badge */}
              <div className="absolute top-4 left-4 bg-primary px-3 py-1 rounded-full text-white text-xs font-semibold">
                Fleet Vehicle #26
              </div>
            </div>

            {/* Content */}
            <div className="p-6 lg:p-8">
              <Quote className="h-10 w-10 text-primary/40 mb-4" />

              <blockquote className="text-white text-lg leading-relaxed mb-6">
                "Started as a mobile tint shop, now we're a full-blown wrap company. This is vehicle #26 in a fleet—we've wrapped 10,000 sq ft for this company using WePrintWraps.com to supercharge our growth."
              </blockquote>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
                  <span className="text-primary font-bold text-lg">E</span>
                </div>
                <div>
                  <p className="text-white font-semibold">Erik</p>
                  <p className="text-white/60 text-sm">Owner, Viking Fleet</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Ruler className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-white font-bold text-lg">10,000+</p>
                  <p className="text-white/50 text-xs">Sq Ft Wrapped</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Truck className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-white font-bold text-lg">#26</p>
                  <p className="text-white/50 text-xs">Fleet Vehicle</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-white font-bold text-lg">Full</p>
                  <p className="text-white/50 text-xs">Wrap Company</p>
                </div>
              </div>
            </div>
          </div>

          {/* Shaun's Image Testimonial */}
          <div className="relative rounded-2xl overflow-hidden min-h-[500px] lg:min-h-0">
            {/* Background Image */}
            <img
              src={testimonialGhostIndustries}
              alt="Shaun from Ghost Industries wrapping a vehicle"
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

            {/* Content */}
            <div className="absolute inset-0 flex flex-col justify-end p-6 lg:p-8">
              {/* Large Quote Mark */}
              <div className="mb-4">
                <svg
                  className="w-16 h-16 text-orange-500 opacity-90"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z"/>
                </svg>
              </div>

              <blockquote className="text-white text-lg lg:text-xl leading-relaxed mb-6">
                WePrintWraps.com has been my go-to for printed wrap film. I love how easy it is to order and how fast they ship. If you're serious about quality these guys are the real deal.
              </blockquote>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-lg">Shaun</p>
                  <p className="text-white/70 text-sm">Ghost Industries, Professional Wrap Installer</p>
                </div>

                {/* WPW Guarantee Badge */}
                <img
                  src={premiumGuaranteeBadge}
                  alt="Premium Wrap Guarantee"
                  className="h-16 w-auto object-contain drop-shadow-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

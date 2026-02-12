/**
 * CommercialPro Landing Page
 *
 * Adapted from Lovable (bright-fleet-flow) for WrapCommand integration.
 * This is the B2B wholesale landing page for WePrintWraps.com.
 *
 * Can be:
 * 1. Accessed directly at /commercial-pro in the WrapCommand dashboard
 * 2. Embedded as an iframe into the WordPress site
 * 3. Used as reference by the sales team
 *
 * Original design: https://bright-fleet-flow.lovable.app
 */

import { Link } from "react-router-dom";
import {
  Truck, Shield, ChevronRight, Phone, Mail, Upload,
  DollarSign, Zap, Grid, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommercialInfoStrip,
  BulkPricingSection,
  PricingUpdateExplainer,
  ApproveProPlusSection,
  CommercialFooter,
  TestimonialSection,
  JacksonQuoteEmbed,
  ApproveProTeaser,
  StickyQuoteBar,
  QuoteWelcomeBanner,
  ProUpgradeStrip,
  TrustLogosStrip,
} from "@/components/commercial";
import heroFleet from "@/assets/commercial/hero-fleet.jpg";
import logoWpw from "@/assets/commercial/logo-wpw.png";
import premiumGuaranteeBadge from "@/assets/commercial/premium-wrap-guarantee-gold.png";

const VALUE_PROPS = [
  { icon: Shield, label: "Premium Wrap Guarantee", desc: "Print flaws reprinted free" },
  { icon: Zap, label: "1-2 Day Production", desc: "Lightning fast turnaround" },
  { icon: Upload, label: "Upload & Buy Online", desc: "Easy file submission" },
  { icon: DollarSign, label: "Wholesale Prices", desc: "Commercial rates" },
  { icon: Truck, label: "3M at Lower Prices", desc: "Premium materials, everyday pricing" },
  { icon: Grid, label: "Command Center", desc: "Quotes • Files • Proofs", link: "/aov-booster", badge: "WrapCommand™" },
];

export default function CommercialPro() {
  return (
    <div className="min-h-screen bg-background">
      {/* Quote Welcome Banner - shows when coming from WPW with quote_id */}
      <QuoteWelcomeBanner />

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <a href="/" className="flex items-center gap-2">
                <img src={logoWpw} alt="WePrintWraps" className="h-8 w-auto" />
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-bold tracking-tight">Commercial</span>
                  <span className="text-lg font-bold text-primary tracking-tight">Pro</span>
                  <span className="text-primary text-xs font-bold ml-0.5">™</span>
                </div>
              </a>

              {/* Nav Links */}
              <nav className="hidden md:flex items-center gap-6">
                <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Pricing
                </a>
                <a href="#volume" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Volume Discounts
                </a>
                <a href="#proofing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  ApprovePro
                </a>
                <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Success Stories
                </a>
              </nav>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-4">
              <a href="tel:602-595-3200" className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Phone className="h-4 w-4" />
                <span>602-595-3200</span>
              </a>
              <Button size="sm" className="font-medium">
                Get Quote
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-[600px] lg:min-h-[700px] overflow-hidden">
        {/* Full-width background image */}
        <div className="absolute inset-0">
          <img
            src={heroFleet}
            alt="Fleet of professionally wrapped commercial vehicles"
            className="w-full h-full object-cover object-center"
          />
          {/* Strong gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 via-40% to-slate-950/40" />
          {/* Image credit caption */}
          <p className="absolute bottom-2 right-4 text-xs text-white/50 italic z-10">
            Image is a fleet done by VikingFleet Prescott, Arizona using WePrintWraps.com for printing.
          </p>
        </div>

        {/* Content overlay */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-12 lg:py-16">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            {/* Left side - Hero text + value props */}
            <div className="pt-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1] mb-4">
                Professional Wraps
                <br />
                <span className="text-white">Built for Business</span>
              </h1>

              <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-6 max-w-xl">
                Built for wrap shops that don't own printers. Wholesale pricing, volume discounts, and 3D proofs that sell jobs.
              </p>

              {/* Quick value props */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="flex items-center gap-2 text-white/90">
                  <Shield className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm">Premium Wrap Guarantee</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <Zap className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm">1-2 Day Production</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <DollarSign className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm">From $5.27/sq ft</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <Truck className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm">3M Premium Materials</span>
                </div>
              </div>

              {/* Premium Wrap Guarantee Badge */}
              <div className="flex items-center gap-3">
                <img
                  src={premiumGuaranteeBadge}
                  alt="Premium Wrap Guarantee"
                  className="h-14 w-auto drop-shadow-lg"
                />
                <p className="text-xs text-white/70 max-w-[180px]">
                  Print flaws reprinted at no cost. Quality guaranteed.
                </p>
              </div>
            </div>

            {/* Right side - Quote Tool Embed */}
            <div className="lg:pt-2">
              <JacksonQuoteEmbed className="shadow-2xl shadow-black/30" />
            </div>
          </div>

          {/* ApprovePro Teaser - below quote, still above fold */}
          <div className="mt-8">
            <ApproveProTeaser />
          </div>
        </div>
      </section>

      {/* Value Props - 6 items with bold gradient */}
      <section className="border-y border-border bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {VALUE_PROPS.map(({ icon: Icon, label, desc, link, badge }) => {
              const content = (
                <div className={`flex flex-col items-center text-center gap-3 p-4 ${link ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}>
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 relative">
                    <Icon className="h-6 w-6 text-white" />
                    {badge && (
                      <span className="absolute -top-1 -right-1 bg-primary text-[8px] text-primary-foreground px-1.5 py-0.5 rounded-full font-medium">
                        ★
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm leading-tight">{label}</p>
                    <p className="text-blue-200/70 text-xs mt-1">{desc}</p>
                    {badge && (
                      <p className="text-primary text-[10px] mt-1 font-medium">{badge}</p>
                    )}
                  </div>
                </div>
              );

              return link ? (
                <Link key={label} to={link}>{content}</Link>
              ) : (
                <div key={label}>{content}</div>
              );
            })}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
      </section>

      {/* Trust Logos Strip */}
      <TrustLogosStrip />

      {/* Commercial Info Strip */}
      <CommercialInfoStrip />

      {/* Pricing Section */}
      <section id="pricing" className="scroll-mt-20">
        <PricingUpdateExplainer />
      </section>

      {/* Volume Pricing Section */}
      <section id="volume" className="scroll-mt-20">
        <BulkPricingSection />
      </section>

      {/* 3D Proofing Section */}
      <section id="proofing" className="scroll-mt-20">
        <ApproveProPlusSection />
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="scroll-mt-20">
        <TestimonialSection />
      </section>

      {/* Pro Upgrade Strip */}
      <section className="bg-muted/30 border-y border-border">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Upgrade Your Wrap Game
            </h2>
            <p className="text-muted-foreground text-sm">
              Professional tools for wrap shops ready to level up
            </p>
          </div>
          <ProUpgradeStrip />
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-20">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                Ready to scale your fleet graphics?
              </h2>
              <p className="text-white/70">
                Contact our commercial team for volume pricing and account setup.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" variant="secondary" className="text-base px-8" asChild>
                <a href="tel:602-595-3200">
                  <Phone className="h-5 w-5 mr-2" />
                  Call 602-595-3200
                </a>
              </Button>
              <Button size="lg" className="text-base px-8 bg-white text-slate-900 hover:bg-white/90" asChild>
                <a href="mailto:Hello@WePrintWraps.com">
                  <Mail className="h-5 w-5 mr-2" />
                  Email Us
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <CommercialFooter />

      {/* Sticky Quote Bar */}
      <StickyQuoteBar />
    </div>
  );
}

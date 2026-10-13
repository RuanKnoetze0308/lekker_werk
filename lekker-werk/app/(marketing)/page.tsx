import { Navbar } from "./_sections/Navbar";
import { Hero } from "./_sections/Hero";
import { TrustStrip } from "./_sections/TrustStrip";
import { FeatureGrid } from "./_sections/FeatureGrid";
import { HowItWorks } from "./_sections/HowItWorks";
import { Pricing } from "./_sections/Pricing";
import { Testimonial } from "./_sections/Testimonial";
import { FinalCta } from "./_sections/FinalCta";
import { Footer } from "./_sections/Footer";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustStrip />
        <FeatureGrid />
        <HowItWorks />
        <Pricing />
        <Testimonial />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

import { Container } from "@/components/ui/Container";
import { Pill } from "@/components/ui/Pill";
import { PricingCards } from "@/components/pricing/PricingCards";
import { TRIAL_DAYS } from "@/lib/pricing";
import { pricingCopy } from "../_content/copy";

export function Pricing() {
  return (
    <section id="pricing" className="bg-soft-surface py-16 sm:py-24">
      <Container className="flex flex-col items-center text-center">
        <Pill className="bg-pale-green text-dark-green">{pricingCopy.pill}</Pill>
        <h2 className="mt-5 font-display text-[32px] font-bold leading-[1.08] text-ink sm:text-[42px]">
          {pricingCopy.heading}
          <br />
          <span className="text-dark-green">{TRIAL_DAYS} days free.</span>
        </h2>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted">{pricingCopy.support}</p>

        <div className="mt-12 w-full">
          <PricingCards />
        </div>

        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-muted">{pricingCopy.footnote}</p>
      </Container>
    </section>
  );
}

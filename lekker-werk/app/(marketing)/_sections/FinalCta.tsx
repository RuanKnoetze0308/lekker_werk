import { Container } from "@/components/ui/Container";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { finalCtaCopy } from "../_content/copy";

export function FinalCta() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <Container>
        <div className="flex flex-col items-start gap-8 rounded-[28px] bg-ink px-8 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-14 sm:py-14">
          <div>
            <Pill className="bg-white/10 text-brand-green">{finalCtaCopy.pill}</Pill>
            <h2 className="mt-5 max-w-md font-display text-[28px] font-bold leading-[1.1] text-white sm:text-[36px]">
              {finalCtaCopy.heading}
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/60">
              {finalCtaCopy.support}
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <Button href="#signup" variant="primary" showArrow>
              {finalCtaCopy.cta}
            </Button>
            <span className="text-[12.5px] text-white/50">{finalCtaCopy.note}</span>
          </div>
        </div>
      </Container>
    </section>
  );
}

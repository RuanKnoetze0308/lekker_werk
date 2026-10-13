import { Fragment } from "react";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Pill } from "@/components/ui/Pill";
import { steps } from "../_content/steps";
import { howItWorksCopy } from "../_content/copy";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-pale-green py-16 sm:py-24">
      <Container className="flex flex-col items-center text-center">
        <Pill className="bg-white text-dark-green">{howItWorksCopy.pill}</Pill>
        <h2 className="mt-5 font-display text-[32px] font-bold text-ink sm:text-[42px]">
          {howItWorksCopy.headingPrefix}{" "}
          <span className="text-dark-green">{howItWorksCopy.headingHighlight}</span>{" "}
          {howItWorksCopy.headingSuffix}
        </h2>
        <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-muted">
          {howItWorksCopy.support}
        </p>

        <div className="mt-14 grid w-full grid-cols-1 gap-10 sm:grid-cols-4 sm:gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:gap-3">
          {steps.map((step, i) => (
            <Fragment key={step.number}>
              <div className="flex flex-col items-center text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-dark-green font-display text-lg font-bold text-white">
                  {step.number}
                </span>
                <h3 className="mt-4 text-[17px] font-semibold text-ink">
                  {step.title}
                </h3>
                <p className="mt-1.5 max-w-[180px] text-[13.5px] leading-relaxed text-muted">
                  {step.description}
                </p>
              </div>

              {i < steps.length - 1 && (
                <div className="hidden items-start justify-center pt-[18px] lg:flex">
                  <ArrowRight className="size-5 shrink-0 text-dark-green/50" aria-hidden />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </Container>
    </section>
  );
}

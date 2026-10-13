import Image from "next/image";
import { CheckCircle2, Play } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { WhatsAppIcon, TelegramIcon, CurvedArrow } from "@/components/ui/BrandIcons";
import { Squiggle } from "@/components/ui/Squiggle";
import { PhoneMockup } from "./PhoneMockup";
import { heroCopy } from "../_content/copy";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-ink">
      <Image
        src="/images/hero/cape-town.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/35"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-ink/20 via-transparent to-ink"
        aria-hidden
      />

      <Container className="relative py-16 sm:py-24 lg:py-28">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
          <div>
            <Pill className="bg-white/10 text-white/90">
              <CheckCircle2 className="size-3.5 text-brand-green" aria-hidden />
              {heroCopy.eyebrow}
            </Pill>

            <h1 className="mt-6 font-display text-[42px] font-bold leading-[1.02] text-white sm:text-[52px] lg:text-[64px]">
              {heroCopy.headlineLine1}
              <br />
              <span className="text-brand-green">Lekker</span> simple.
            </h1>

            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/85">
              {heroCopy.support}
            </p>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/60">
              {heroCopy.subSupport}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button href="#signup" variant="primary" showArrow>
                {heroCopy.primaryCta}
              </Button>
              <Button
                href="#how-it-works"
                variant="secondary-dark"
                icon={<Play className="size-3.5" aria-hidden />}
              >
                {heroCopy.secondaryCta}
              </Button>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              {heroCopy.trustPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-1.5 text-[13px] text-white/70"
                >
                  <CheckCircle2 className="size-3.5 text-brand-green" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex justify-center pt-10 lg:justify-end lg:pt-0">
            <div className="pointer-events-none absolute -top-12 right-4 z-10 hidden -rotate-2 text-right sm:block">
              <span className="whitespace-nowrap font-hand text-2xl leading-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]">
                Built for South Africa
              </span>
              <Squiggle className="ml-auto mt-0.5 h-2 w-28 text-brand-green" />
            </div>

            <div className="animate-float">
              <PhoneMockup />
            </div>

            <div className="absolute -right-6 top-[30%] hidden flex-col items-center gap-4 sm:flex lg:-right-14">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-[#25D366] text-white shadow-xl">
                <WhatsAppIcon className="size-8" />
              </span>
              <span className="flex size-16 items-center justify-center rounded-2xl bg-[#229ED9] text-white shadow-xl">
                <TelegramIcon className="size-8" />
              </span>
              <div className="flex items-start gap-1">
                <CurvedArrow className="size-9 -scale-x-100 text-white/70" />
                <span className="max-w-[90px] pt-2 font-hand text-lg leading-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.7)]">
                  {heroCopy.channelNote}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

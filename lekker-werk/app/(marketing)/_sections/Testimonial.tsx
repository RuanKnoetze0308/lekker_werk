import Image from "next/image";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Pill } from "@/components/ui/Pill";
import { testimonials } from "../_content/testimonials";
import { testimonialCopy } from "../_content/copy";

export function Testimonial() {
  const testimonial = testimonials[0];

  return (
    <section className="bg-white py-16 sm:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[24px]">
            <Image
              src="/images/testimonial/barista.jpg"
              alt="Small business owner using LekkerWerk on his phone"
              fill
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover"
            />
          </div>
          <div className="absolute bottom-6 left-6 -rotate-2 rounded-[10px] bg-white px-4 py-3 shadow-lg">
            <p className="font-hand text-lg leading-tight text-ink">
              &ldquo;No more
              <br />
              chasing timesheets.
              <br />
              Lekker!&rdquo;
            </p>
          </div>
        </div>

        <div>
          <Pill className="bg-pale-green text-dark-green">{testimonialCopy.pill}</Pill>

          <blockquote className="mt-6 font-display text-[26px] font-semibold leading-[1.28] text-ink sm:text-[30px]">
            &ldquo;{testimonial.quote}&rdquo;
          </blockquote>

          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative size-11 overflow-hidden rounded-full">
                <Image
                  src={testimonial.avatarSrc}
                  alt={testimonial.name}
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-ink">
                  {testimonial.name}
                </p>
                <p className="text-[13px] text-muted">{testimonial.role}</p>
                <div className="mt-0.5 flex gap-0.5 text-brand-green">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="size-3.5 fill-current" aria-hidden />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous testimonial"
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-ink/40 hover:text-ink"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next testimonial"
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-ink/40 hover:text-ink"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

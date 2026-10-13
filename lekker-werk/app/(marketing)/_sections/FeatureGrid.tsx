import { Container } from "@/components/ui/Container";
import { Pill } from "@/components/ui/Pill";
import { IconTile } from "@/components/ui/IconTile";
import { features } from "../_content/features";
import { featureGridCopy } from "../_content/copy";

export function FeatureGrid() {
  return (
    <section id="product" className="bg-white py-16 sm:py-24">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-lg">
            <Pill className="bg-pale-green text-dark-green">
              {featureGridCopy.pill}
            </Pill>
            <h2 className="mt-5 font-display text-[32px] font-bold leading-[1.08] text-ink sm:text-[42px]">
              {featureGridCopy.headingLine1}
              <br />
              <span className="text-dark-green">
                {featureGridCopy.headingLine2Highlight}
              </span>
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">
              {featureGridCopy.support}
            </p>
          </div>

          <span className="hidden whitespace-pre-line font-hand text-xl leading-tight text-ink/70 sm:block">
            {featureGridCopy.sideNote}
          </span>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ title, description, icon, tileClassName }) => (
            <div
              key={title}
              className="rounded-[22px] border border-border bg-white p-6 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <IconTile icon={icon} className={tileClassName} />
              <h3 className="mt-4 text-[18px] font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
                {description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

import { Container } from "@/components/ui/Container";
import { Squiggle } from "@/components/ui/Squiggle";
import { industries } from "../_content/industries";
import { trustStripCopy } from "../_content/copy";

export function TrustStrip() {
  return (
    <section className="border-b border-border bg-soft-surface py-10">
      <Container>
        <p className="text-center text-[11px] font-semibold tracking-wide text-muted sm:text-left">
          {trustStripCopy.eyebrow}
        </p>

        <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row sm:justify-between">
          <ul className="flex flex-wrap justify-center gap-x-8 gap-y-5 sm:justify-start">
            {industries.map(({ label, icon: Icon, colorClassName }) => (
              <li
                key={label}
                className="flex flex-col items-center gap-2 text-muted"
              >
                <Icon className={`size-6 ${colorClassName}`} aria-hidden />
                <span className="text-[11px] font-medium">{label}</span>
              </li>
            ))}
          </ul>

          <div className="text-center sm:text-right">
            <span className="font-hand text-xl leading-tight text-ink/70">
              Any team.
              <br />
              Any industry.
            </span>
            <Squiggle className="mx-auto mt-0.5 h-2 w-24 text-brand-green sm:ml-auto sm:mr-0" />
          </div>
        </div>
      </Container>
    </section>
  );
}

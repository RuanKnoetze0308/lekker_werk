import { Heart } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/brand/Logo";
import {
  LinkedinIcon,
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
} from "@/components/ui/BrandIcons";
import { footerLinks } from "../_content/navigation";
import { footerCopy } from "../_content/copy";

const socialIcons = [
  { icon: LinkedinIcon, label: "LinkedIn" },
  { icon: FacebookIcon, label: "Facebook" },
  { icon: InstagramIcon, label: "Instagram" },
  { icon: YoutubeIcon, label: "YouTube" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-white">
      <Container className="flex flex-col gap-8 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Logo variant="dark" tagline={footerCopy.tagline} />

        <nav className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {footerLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            {socialIcons.map(({ icon: Icon, label }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="text-muted transition-colors hover:text-ink"
              >
                <Icon className="size-[18px]" />
              </a>
            ))}
          </div>
          <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
            {footerCopy.madeFor}
            <Heart className="size-3.5 fill-current" aria-hidden />
          </span>
        </div>
      </Container>
    </footer>
  );
}

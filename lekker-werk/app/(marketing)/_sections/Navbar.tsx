"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/brand/Logo";
import { navLinks } from "../_content/navigation";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || menuOpen;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 w-full transition-colors duration-200 ${
        solid ? "bg-ink/95 backdrop-blur-sm" : "bg-transparent"
      }`}
    >
      <Container>
        <nav className="flex h-[76px] items-center justify-between">
          <Logo variant="light" tagline="PEOPLE ON TIME" />

          <ul className="hidden items-center gap-8 lg:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm font-medium text-white/85 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-6 lg:flex">
            <a
              href="#login"
              className="text-sm font-medium text-white/85 transition-colors hover:text-white"
            >
              Login
            </a>
            <Button href="#signup" variant="primary" showArrow>
              Sign Up
            </Button>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            className="flex size-10 items-center justify-center rounded-full text-white lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </nav>

        {menuOpen && (
          <div className="flex flex-col gap-4 border-t border-white/10 py-6 lg:hidden">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/85"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a href="#login" className="text-sm font-medium text-white/85" onClick={() => setMenuOpen(false)}>
              Login
            </a>
            <Button href="#signup" variant="primary" showArrow className="w-fit">
              Sign Up
            </Button>
          </div>
        )}
      </Container>
    </header>
  );
}

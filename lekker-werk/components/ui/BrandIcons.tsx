export function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.87.5 3.62 1.44 5.15L2 22l5.1-1.54a9.9 9.9 0 0 0 4.94 1.31h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.83 14.02c-.24.68-1.42 1.32-1.94 1.4-.5.08-1.05.11-1.7-.11-.39-.13-.9-.29-1.55-.57-2.73-1.18-4.5-3.94-4.64-4.13-.14-.19-1.1-1.46-1.1-2.78 0-1.32.7-1.96.95-2.23.24-.26.53-.33.71-.33.18 0 .36 0 .51.01.16.01.39-.06.6.46.24.59.81 2.04.88 2.19.07.15.12.32.02.51-.1.19-.15.31-.29.48-.14.17-.3.38-.43.51-.14.14-.28.28-.12.55.16.27.72 1.19 1.55 1.93 1.07.95 1.97 1.24 2.24 1.38.27.14.43.12.59-.05.16-.17.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.53.72 1.79.85.26.13.43.19.5.3.06.11.06.63-.18 1.31Z" />
    </svg>
  );
}

export function TelegramIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M21.5 3.5 2.75 10.9c-.9.36-.88 1.65.03 1.98l4.4 1.55 1.7 5.48c.24.78 1.24.99 1.79.37l2.25-2.53 4.43 3.27c.7.52 1.7.15 1.9-.7l3.53-15.6c.22-.98-.76-1.75-1.28-1.22ZM9.02 14.6l-3.1-1.09 11.55-7.2c.24-.15.42.14.22.32l-8.13 7.34a1 1 0 0 0-.32.63l-.22 2.7-1.6-2.3c-.06-.1.04-.28.06-.4Z" />
    </svg>
  );
}

export function LinkedinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 3.25a1.96 1.96 0 1 0 0 3.92 1.96 1.96 0 0 0 0-3.92ZM20.44 20h-3.37v-6.03c0-1.44-.03-3.28-2-3.28-2 0-2.31 1.56-2.31 3.18V20H9.4V8.5h3.24v1.57h.05c.45-.85 1.56-1.75 3.2-1.75 3.42 0 4.55 2.25 4.55 5.18V20Z" />
    </svg>
  );
}

export function FacebookIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13.5 21v-7.2h2.4l.45-2.8h-2.85v-1.8c0-.8.26-1.34 1.4-1.34h1.5V5.4c-.26-.03-1.15-.11-2.19-.11-2.18 0-3.66 1.32-3.66 3.75v2.06H8.05v2.8h2.5V21h2.95Z" />
    </svg>
  );
}

export function InstagramIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.7" />
      <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function YoutubeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M21.6 7.6a2.5 2.5 0 0 0-1.76-1.77C18.13 5.4 12 5.4 12 5.4s-6.13 0-7.84.43A2.5 2.5 0 0 0 2.4 7.6 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.4 2.5 2.5 0 0 0 1.76 1.77c1.71.43 7.84.43 7.84.43s6.13 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.4ZM10 14.9V9.1L15 12l-5 2.9Z" />
    </svg>
  );
}

export function CurvedArrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 60" fill="none" className={className} aria-hidden>
      <path
        d="M52 6C40 10 26 22 22 44"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 5"
      />
      <path
        d="M14 38 L21 46 L29 40"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

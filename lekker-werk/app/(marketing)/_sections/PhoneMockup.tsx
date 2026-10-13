import { ArrowLeft, MoreVertical, Paperclip, Camera, Mic, CheckCheck, Signal, Wifi, BatteryFull } from "lucide-react";

export function PhoneMockup() {
  return (
    <div className="w-[280px] rounded-[36px] border-[6px] border-ink bg-ink p-1.5 shadow-2xl sm:w-[300px]">
      <div className="overflow-hidden rounded-[28px] bg-[#ECE5DD]">
        <div className="flex items-center justify-between bg-white px-4 pt-3 text-[11px] font-semibold text-ink">
          <span>09:41</span>
          <span className="flex items-center gap-1 text-ink/80">
            <Signal className="size-3" aria-hidden />
            <Wifi className="size-3" aria-hidden />
            <BatteryFull className="size-3.5" aria-hidden />
          </span>
        </div>

        <div className="flex items-center gap-2 bg-dark-green px-3 py-2.5 text-white">
          <ArrowLeft className="size-4" aria-hidden />
          <span className="flex size-7 items-center justify-center rounded-full bg-white text-dark-green">
            <CheckCheck className="size-4" aria-hidden />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[12.5px] font-semibold">LekkerWerk</span>
            <span className="text-[10px] text-white/75">Business Account</span>
          </div>
          <MoreVertical className="ml-auto size-4" aria-hidden />
        </div>

        <div className="flex flex-col gap-2 px-2.5 py-3">
          <Bubble align="right" time="07:58" sentCheck>
            Clock in
          </Bubble>
          <Bubble align="left" time="07:58" check>
            <span className="font-semibold">You&rsquo;re clocked in!</span>
            <br />
            Time: 07:58
            <br />
            Location: Ballito, KZN
            <br />
            Have a lekker day! 🎉
          </Bubble>
          <Bubble align="right" time="17:02" sentCheck>
            Clock out
          </Bubble>
          <Bubble align="left" time="17:02" check>
            <span className="font-semibold">You&rsquo;re clocked out!</span>
            <br />
            Time: 17:02
            <br />
            Total hours: 9h 4m
            <br />
            Thanks for the hard work! 🙌
          </Bubble>
        </div>

        <div className="flex items-center gap-2 bg-[#F0F0F0] px-2.5 py-2.5">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 text-[11px] text-muted">
            <Paperclip className="size-3.5" aria-hidden />
            <span>Message</span>
            <Camera className="ml-auto size-3.5" aria-hidden />
          </div>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-dark-green text-white">
            <Mic className="size-4" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  align,
  time,
  check,
  sentCheck,
  children,
}: {
  align: "left" | "right";
  time: string;
  check?: boolean;
  sentCheck?: boolean;
  children: React.ReactNode;
}) {
  const isRight = align === "right";
  return (
    <div className={`flex ${isRight ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-[10px] px-2.5 py-1.5 text-[11.5px] leading-snug shadow-sm ${
          isRight ? "bg-[#DCF8C6] text-ink" : "bg-white text-ink"
        }`}
      >
        {check && (
          <CheckCheck className="mb-0.5 size-3.5 text-dark-green" aria-hidden />
        )}
        {children}
        <span className="mt-1 flex items-center justify-end gap-1 text-[9px] text-muted">
          {time}
          {sentCheck && <CheckCheck className="size-3 text-[#4FC3F7]" aria-hidden />}
        </span>
      </div>
    </div>
  );
}

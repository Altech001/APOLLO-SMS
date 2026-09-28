import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AuthInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={cn(
        "bg-card border-border text-foreground h-12 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/20",
        props.className,
      )}
    />
  );
}

export function PasswordInput({
  show,
  onToggle,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { show: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <AuthInput {...props} type={show ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function SubmitButton({ children, isLoading, disabled }: { children: React.ReactNode; isLoading: boolean; disabled?: boolean }) {
  return (
    <Button type="submit" disabled={isLoading || disabled} className="w-full h-10 mt-6 font-medium">
      {children}
    </Button>
  );
}

export function Divider() {
  return (
    <div className="w-full flex items-center my-6">
      <div className="flex-1 h-px bg-border" />
      <span className="px-3 text-[11px] text-muted-foreground font-medium uppercase">or</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/** Measures its own width so the Google Identity button can be sized to match. */
export function GoogleButtonContainer({ children }: { children: (width: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(Math.floor(next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full flex justify-center">
      {width > 0 ? children(width) : null}
    </div>
  );
}

/** Six-digit SMS code entry. */
export function CodeInput({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <div className="flex justify-center">
      <InputOTP maxLength={6} value={value} onChange={onChange} disabled={disabled} inputMode="numeric" pattern="^[0-9]*$" autoFocus>
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="h-12 w-11 bg-card text-base" />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

/** Seconds left before a resend is allowed; call start() after each send. */
export function useCooldown(seconds = 60) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
  return { left, start: () => setLeft(seconds) };
}

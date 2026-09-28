import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

// Square flags from country-flag-icons, bundled as static assets by Vite and loaded lazily per <img>,
// so the picker never depends on a third-party flag CDN being reachable.
const FLAG_URLS = import.meta.glob("/node_modules/country-flag-icons/1x1/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const flagUrl = (country: string) => FLAG_URLS[`/node_modules/country-flag-icons/1x1/${country}.svg`];

/** Countries shown first, in this order; Uganda is the default. */
const PINNED: CountryCode[] = ["UG", "KE", "TZ", "RW", "BI", "SS", "CD"];
export const DEFAULT_COUNTRY: CountryCode = "UG";

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

interface CountryOption {
  code: CountryCode;
  name: string;
  dial: string;
}

function buildCountries(): { pinned: CountryOption[]; rest: CountryOption[] } {
  const all = getCountries().map((code) => ({
    code,
    name: regionNames?.of(code) || code,
    dial: `+${getCountryCallingCode(code)}`,
  }));
  const byCode = new Map(all.map((c) => [c.code, c]));
  const pinned = PINNED.map((code) => byCode.get(code)).filter(Boolean) as CountryOption[];
  const rest = all.filter((c) => !PINNED.includes(c.code)).sort((a, b) => a.name.localeCompare(b.name));
  return { pinned, rest };
}

export function CircleFlag({ country, className }: { country: string; className?: string }) {
  const src = flagUrl(country);
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border",
        className ?? "h-5 w-5",
      )}
      aria-hidden
    >
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="text-[8px] font-bold text-muted-foreground">{country}</span>
      )}
    </span>
  );
}

/** Validates a national number for a country and returns it in E.164 (+256712345678), or null. */
export function toE164(country: CountryCode, national: string): string | null {
  const parsed = parsePhoneNumberFromString(national, country);
  return parsed && parsed.isValid() ? parsed.number : null;
}

interface PhoneInputProps {
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
  /** The national part only, without the dialling code. */
  value: string;
  onChange: (national: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}

export function PhoneInput({ country, onCountryChange, value, onChange, invalid, disabled }: PhoneInputProps) {
  const [open, setOpen] = useState(false);
  const { pinned, rest } = useMemo(buildCountries, []);
  const dial = `+${getCountryCallingCode(country)}`;

  const handleChange = (raw: string) => {
    // Pasting a full international number switches the country automatically.
    if (raw.trim().startsWith("+")) {
      const parsed = parsePhoneNumberFromString(raw);
      if (parsed?.country) {
        onCountryChange(parsed.country);
        onChange(parsed.formatNational());
        return;
      }
    }
    // Only reformat when typing forward, so backspace over a space still works.
    const formatted = raw.length > value.length ? new AsYouType(country).input(raw) : raw;
    onChange(formatted.replace(/[^\d\s()-]/g, ""));
  };

  const renderItem = (c: CountryOption) => (
    <CommandItem
      key={c.code}
      value={`${c.name} ${c.dial} ${c.code}`}
      onSelect={() => {
        onCountryChange(c.code);
        setOpen(false);
      }}
      className="cursor-pointer gap-2  "
    >
      <CircleFlag country={c.code} />
      <span className="flex-1 truncate text-sm text-foreground">{c.name}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{c.dial}</span>
      <Check className={cn("h-4 w-4", c.code === country ? "opacity-100" : "opacity-0")} />
    </CommandItem>
  );

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Country: ${regionNames?.of(country) || country} (${dial})`}
            className="flex h-12 w-[118px] shrink-0 items-center gap-2 rounded border border-border bg-card px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
          >
            <CircleFlag country={country} />
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{dial}</span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[300px] p-0 rounded">
          <Command filter={(value, search) => (value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}>
            <CommandInput placeholder="Search country or code" />
            <CommandList className="max-h-[280px]">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup heading="East Africa">{pinned.map(renderItem)}</CommandGroup>
              <CommandGroup heading="All countries">{rest.map(renderItem)}</CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        disabled={disabled}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="712 345 678"
        aria-invalid={invalid || undefined}
        className={cn(
          "h-12 flex-1 border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/20",
          invalid && "border-destructive focus-visible:ring-destructive/20",
        )}
      />
    </div>
  );
}

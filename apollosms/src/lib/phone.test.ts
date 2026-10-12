import { describe, expect, it } from "vitest";
import { normalizeUgandanPhone } from "./phone";

describe("normalizeUgandanPhone", () => {
    it.each([
        ["0772 123 456", "+256772123456"],
        ["772123456", "+256772123456"],
        ["256772123456", "+256772123456"],
        ["+256 772-123-456", "+256772123456"],
        ["00256772123456", "+256772123456"],
    ])("normalizes %s", (input, expected) => {
        expect(normalizeUgandanPhone(input)).toBe(expected);
    });

    it.each(["+254712345678", "0772123", "77212345", "abc0772123456", ""])('rejects "%s"', (input) => {
        expect(normalizeUgandanPhone(input)).toBeNull();
    });
});

import { describe, it, expect } from "vitest";

// Replicate the exact pattern matching logic used in AITipsy.tsx
const matchRoute = (pathname: string, excludedPatterns: string[]): boolean => {
  return excludedPatterns.some(pattern => {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) return false;
    return patternParts.every((part, i) => part.startsWith(':') || part === pathParts[i]);
  });
};

describe("AI Widget Route Exclusion Matcher", () => {
  const excludedPatterns = [
    "/login",
    "/signup",
    "/agent",
    "/complex-ai",
    "/bookmark-tasks",
    "/bookmark-documents",
    "/connectors",
    "/forms/:id/edit"
  ];

  it("should correctly exclude exact path matches", () => {
    expect(matchRoute("/login", excludedPatterns)).toBe(true);
    expect(matchRoute("/signup", excludedPatterns)).toBe(true);
    expect(matchRoute("/agent", excludedPatterns)).toBe(true);
    expect(matchRoute("/connectors", excludedPatterns)).toBe(true);
  });

  it("should correctly exclude parameterized path matches like /forms/:id/edit", () => {
    expect(matchRoute("/forms/123/edit", excludedPatterns)).toBe(true);
    expect(matchRoute("/forms/abc-def-123/edit", excludedPatterns)).toBe(true);
    expect(matchRoute("/forms/my-custom-form-id/edit", excludedPatterns)).toBe(true);
  });

  it("should not exclude different dynamic paths or longer paths", () => {
    expect(matchRoute("/", excludedPatterns)).toBe(false);
    expect(matchRoute("/dashboard", excludedPatterns)).toBe(false);
    expect(matchRoute("/forms/123", excludedPatterns)).toBe(false);
    expect(matchRoute("/forms/123/responses", excludedPatterns)).toBe(false);
    expect(matchRoute("/forms/123/edit/extra", excludedPatterns)).toBe(false);
    expect(matchRoute("/bookmark-tasks/123", excludedPatterns)).toBe(false);
  });

  it("should handle trailing slashes robustly", () => {
    expect(matchRoute("/login/", excludedPatterns)).toBe(true);
    expect(matchRoute("/forms/123/edit/", excludedPatterns)).toBe(true);
  });
});

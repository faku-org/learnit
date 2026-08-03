import type { Matchers } from "bun:test";

declare module "bun:test" {
  // jest-dom matchers, extended at runtime in tests/setup.ts.
  interface Matchers<T> {
    toBeInTheDocument(): void;
    toBeDisabled(): void;
    toBeEnabled(): void;
    toHaveAttribute(attr: string, value?: string): void;
    toHaveClass(...classNames: string[]): void;
  }
}

export type {};

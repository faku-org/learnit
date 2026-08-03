import { expect } from "bun:test";
import { JSDOM } from "jsdom";

// Must run before any module that transitively loads @testing-library/dom,
// whose `screen` captures `document.body` at import time.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const { window } = dom;
for (const key of [
  "window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node",
  "Event", "CustomEvent", "MouseEvent", "KeyboardEvent",
  "FileReader", "URL", "URLSearchParams", "Image", "MutationObserver",
  "getComputedStyle", "localStorage", "sessionStorage",
  "matchMedia", "DOMParser", "XMLSerializer", "ShadowRoot",
] as const) {
  (globalThis as Record<string, unknown>)[key] = (window as unknown as Record<string, unknown>)[key];
}
// Keep Bun's native Blob, FormData, and File (jsdom's are not instanceof-
// compatible with the ones Bun's fetch produces).

// jsdom's rAF does not tick while Bun awaits, which leaves framer-motion exit
// animations permanently mid-flight. Fire them on the next macrotask instead.
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 0)) as unknown as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as unknown as typeof cancelAnimationFrame;

// jsdom does not implement a few browser globals components reach for.
class NoopAudio {
  play() { return Promise.resolve(); }
  pause() {}
  set preload(_v: string) {}
  set currentTime(_v: number) {}
}
globalThis.Audio = NoopAudio as unknown as typeof Audio;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.scrollTo = () => {};
globalThis.getSelection = () => null;
if (!globalThis.requestIdleCallback) {
  globalThis.requestIdleCallback = ((cb: () => void) => setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
  globalThis.cancelIdleCallback = ((id: number) => clearTimeout(id)) as unknown as typeof cancelIdleCallback;
}

// Components position popups from layout metrics jsdom does not compute.
Element.prototype.getBoundingClientRect = () =>
  ({ left: 10, right: 110, top: 10, bottom: 30, width: 100, height: 20, x: 10, y: 10, toJSON: () => ({}) }) as DOMRect;

const jestDomMatchers = await import("@testing-library/jest-dom/matchers");
const { default: _default, ...matchers } = jestDomMatchers;
expect.extend(matchers as Parameters<typeof expect.extend>[0]);

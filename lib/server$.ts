// server$.ts
export function server$<T extends (...args: any[]) => any>(fn: T): T {
  // In SSR context, return the function directly
  // Check if we're in Node.js and if this is likely an SSR context
  if (typeof process !== "undefined" && typeof window === "undefined") {
    return fn;
  }

  // In client builds, throw an error
  throw new Error("server$ can only be used at build time");
}

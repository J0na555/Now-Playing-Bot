// Dev-only resolve hook: retries extensionless relative/absolute specifiers
// with .ts (then .mts/.cts) when Node's default resolver can't find them.
// Lets the deployed source stay extensionless for Vercel's compiler while
// `npm run dev` resolves the same imports natively.
//
// Usage: node --import ./scripts/ts-resolve-hook.mjs ...

import { registerHooks } from "node:module";

const EXTENSIONS = [".ts", ".mts", ".cts"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (hasExtension(specifier) || !isRelativeOrAbsolute(specifier)) {
      return nextResolve(specifier, context);
    }
    for (const ext of EXTENSIONS) {
      try {
        return nextResolve(specifier + ext, context);
      } catch {
        // not this one, try next
      }
    }
    // no extension worked — let the original error surface
    return nextResolve(specifier, context);
  },
});

function isRelativeOrAbsolute(specifier) {
  return specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("file:");
}

function hasExtension(specifier) {
  if (specifier.includes("\0")) return true; // virtual/built-in
  const lastSegment = specifier.split("/").pop();
  return lastSegment && /\.[a-z]{1,4}$/i.test(lastSegment);
}

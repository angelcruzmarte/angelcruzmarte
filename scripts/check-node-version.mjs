// Fails Vercel builds on a Node.js 24.x runtime older than the patched release
// from the Oct 2026 Node.js security advisory (Brotli decompression RCE).
// Local and sandbox builds only log the version so development is not blocked.
const MINIMUM = [24, 22, 1];

const current = process.versions.node.split(".").map(Number);
const isPatched =
  current[0] === MINIMUM[0] &&
  (current[1] > MINIMUM[1] || (current[1] === MINIMUM[1] && current[2] >= MINIMUM[2]));

console.log(`[node-version-check] Node.js ${process.version} (minimum ${MINIMUM.join(".")})`);

if (!isPatched) {
  const message = `[node-version-check] Node.js ${process.version} does not include the security fix; ${MINIMUM.join(".")} or newer 24.x is required.`;
  if (process.env.VERCEL) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`${message} Continuing because this is not a Vercel build.`);
}

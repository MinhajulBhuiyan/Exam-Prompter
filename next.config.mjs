/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a build run beside a dev server without sharing .next (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    // The cough-detection model (~16 MB) never changes, so let browsers keep it.
    return [{ source: "/models/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};

export default nextConfig;

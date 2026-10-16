/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server for the prod image (DECISIONS W23).
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Dev server only: hosts that legitimately load dev resources (HMR). The port is published on 127.0.0.1;
  // the e2e container reaches the server as `web` (compose.dev.yml).
  allowedDevOrigins: ['127.0.0.1', 'web'],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.43.133",
    "192.168.43.133:3000",
    "192.168.43.133:3001",
    "192.168.43.9",
    "192.168.43.9:3000",
    "192.168.43.9:3001",
    "localhost:3000",
    "localhost:3001",
    "127.0.0.1:3000",
    "127.0.0.1:3001",
    "federation-social-cancel-awareness.trycloudflare.com",
    "*.trycloudflare.com",
  ],
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  async rewrites() {
    const phpApiUrl = process.env.NEXT_PUBLIC_PHP_API_URL;
    if (phpApiUrl) {
      return {
        beforeFiles: [
          {
            source: '/api/:path*',
            destination: `${phpApiUrl.replace(/\/+$/, '')}/:path*`,
          },
        ],
      };
    }
    return [];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'",
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
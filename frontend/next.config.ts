import type { NextConfig } from 'next';

// Inside Docker Compose the Django service is reachable as `backend`.
// When running the frontend directly on the host (npm run dev), fall back to
// the local Django development server on port 8000.
const backendUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.VITE_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'http://backend:8000'
    : 'http://127.0.0.1:8000');

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8000' },
      { protocol: 'http', hostname: '127.0.0.1', port: '8000' },
      { protocol: 'http', hostname: 'backend', port: '8000' },
    ],
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/media/:path*', destination: `${backendUrl}/media/:path*` },
        { source: '/static/:path*', destination: `${backendUrl}/static/:path*` },
        { source: '/api/:path*/', destination: `${backendUrl}/api/:path*/` },
        { source: '/api/:path*', destination: `${backendUrl}/api/:path*/` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;

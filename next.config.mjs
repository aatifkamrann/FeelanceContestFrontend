/** @type {import('next').NextConfig} */
const nextConfig = {
  // One droppable folder for the Docker image.
  output: 'standalone',

  // In compose, Caddy routes /api/* before requests ever reach Next; this
  // rewrite covers the bare-metal dev loop (next dev on :3000, API on :8080).
  // Where the API has a hostname of its own (the Branding settings' API
  // URL), the browser never asks this origin for /api/* at all — lib/api's
  // apiFetch goes straight there — and the rewrite is only a net under a
  // stray link.
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? 'http://localhost:8080';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },

  // Contests became opportunities on 2026-09-28. Every link sent before
  // then — emails, notification rows, bookmarks, search results — still
  // lands on the page it meant; the query string rides along.
  async redirects() {
    return [
      { source: '/contests', destination: '/opportunities', permanent: true },
      { source: '/contests/:path*', destination: '/opportunities/:path*', permanent: true },
      { source: '/client/contests', destination: '/client/opportunities', permanent: true },
      { source: '/client/contests/:path*', destination: '/client/opportunities/:path*', permanent: true },
    ];
  },
};

export default nextConfig;

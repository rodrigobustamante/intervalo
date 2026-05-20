/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["maplibre-gl"],
  compress: true,
  headers: () => [
    {
      // Cache static GTFS-derived JSON for 1 hour, serve stale for 24h while revalidating
      source: "/data/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
      ],
    },
    {
      source: "/favicon.svg",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};

export default nextConfig;

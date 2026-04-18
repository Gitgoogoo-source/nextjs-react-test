import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "t.me", pathname: "/**" },
      { protocol: "https", hostname: "**.telegram.org", pathname: "/**" },
      { protocol: "https", hostname: "**.telegram-cdn.org", pathname: "/**" },
    ],
  },
};

export default nextConfig;

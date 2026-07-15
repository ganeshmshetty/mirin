import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Silence multiple lockfiles warning by defining the absolute Turbopack workspace root.
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;

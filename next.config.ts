import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mediapipe/hands", "@mediapipe/drawing_utils"],
  turbopack: {
    // Explicitly set the root to the current working directory to prevent 
    // Turbopack from jumping to the user home directory.
    root: process.cwd(),
  },
};



export default nextConfig;

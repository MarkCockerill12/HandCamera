import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mediapipe/hands", "@mediapipe/drawing_utils"],
  turbopack: {
    // Explicitly set the root to the current working directory to prevent 
    // Turbopack from jumping to the user home directory.
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
};



export default nextConfig;

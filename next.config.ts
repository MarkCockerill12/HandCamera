import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mediapipe/hands", "@mediapipe/drawing_utils"],
  turbopack: {
    // Explicitly set the root to the current working directory to prevent 
    // Turbopack from jumping to the user home directory.
    root: process.cwd(),
  },
  // Note: no COEP/COOP headers. They were only needed for onnxruntime-web's
  // threaded WASM backend, and `require-corp` blocks MediaPipe's CDN assets.
};

export default nextConfig;

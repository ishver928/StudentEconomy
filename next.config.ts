import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The AI Navigator accepts up to 3 PDFs of 10 MB each (validated again in lib/pdf.ts).
      bodySizeLimit: '31mb',
    },
  },
};

export default nextConfig;

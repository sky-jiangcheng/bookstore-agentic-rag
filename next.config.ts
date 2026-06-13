
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  serverExternalPackages: ['exceljs'],
  allowedDevOrigins: ['*.monkeycode-ai.online'],
};

export default nextConfig;

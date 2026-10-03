/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@aquakart/config', '@aquakart/types', '@aquakart/validation'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@aquakart/config', '@aquakart/types', '@aquakart/validation'],
};

module.exports = nextConfig;

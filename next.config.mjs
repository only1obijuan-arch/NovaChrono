/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["argon2"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
};
export default nextConfig;
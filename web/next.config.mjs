/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Phone/LAN dev: must match the IP you open on mobile (see `ipconfig getifaddr en0`).
  allowedDevOrigins: ["192.168.1.152", "192.168.1.156"],
};

export default nextConfig;

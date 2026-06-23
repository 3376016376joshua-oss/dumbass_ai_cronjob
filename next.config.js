/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@resvg/resvg-js'],
  },
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals.push({
        '@resvg/resvg-js': 'commonjs @resvg/resvg-js',
      });
    }

    return config;
  },
};

module.exports = nextConfig;

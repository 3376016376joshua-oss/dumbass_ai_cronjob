/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@resvg/resvg-js'],
    outputFileTracingIncludes: {
      '/api/cron/fetch-model-snapshots': [
        './node_modules/dejavu-fonts-ttf/ttf/*.ttf',
      ],
    },
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

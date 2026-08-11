const { createProxyMiddleware } = require('http-proxy-middleware');
const packageJson = require('../package.json');

module.exports = function (app) {
  // Where the dev server sends /api and /opensearch.
  //
  // package.json names Docker hostnames -- backend:8000, opensearch:5410 --
  // which resolve inside the compose network and nowhere else, so `npm start`
  // on a workstation cannot reach them. Rather than edit package.json, which
  // `npm run load-config` rewrites from openimis.json on every run, the target
  // can be overridden per developer:
  //
  //   OPENIMIS_PROXY_TARGET=https://www.openimislaos.site
  //
  // Put it in .env.local, which is gitignored. Unset, nothing changes.
  const override = process.env.OPENIMIS_PROXY_TARGET;
  if (override) {
    console.log(`Proxy target overridden by OPENIMIS_PROXY_TARGET: ${override}`);
  }

  // Now load any static proxies from package.json (like opensearch)
  const proxyConfig = packageJson.proxies;
  if (proxyConfig && typeof proxyConfig === 'object') {
    Object.entries(proxyConfig).forEach(([key, value]) => {
      // Skip 'api' – we already handled it above
      const base = value.base;
      const target = override || value.target;
      const newBase = value.newBase ?? value.base;

      if (base && target) {
        app.use(
          base,
          createProxyMiddleware({
            target,
            changeOrigin: true,
            pathRewrite: {
              [`^${base}`]: `${newBase}`,
            },
            logLevel: 'debug',
          })
        );
        console.log(`Proxy set up for [${key}]: ${base} → ${target}`);
      }
    });
  }
};

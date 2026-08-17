#!/usr/bin/env node
// Generates krakend.json.tmpl from module definitions
// KrakenD CE Gin router: {param} matches one segment. Cannot mix {path} wildcard
// with more-specific multi-segment routes. So we enumerate ALL routes explicitly.

const modules = [
  { name: 'auth',        env: 'API_AUTH_URL',         methods: ['GET','POST'] },
  { name: 'users',       env: 'API_USERS_URL',        methods: ['GET','POST','PATCH','PUT','DELETE'] },
  { name: 'portfolios',  env: 'API_PORTFOLIOS_URL',   methods: ['GET','POST','PATCH','DELETE'] },
  { name: 'wallets',     env: 'API_WALLETS_URL',      methods: ['GET','POST','PATCH','DELETE'] },
  { name: 'instruments', env: 'API_INSTRUMENTS_URL',  methods: ['GET'] },
  { name: 'watchlists',  env: 'API_WATCHLISTS_URL',   methods: ['GET','POST','DELETE'] },
  { name: 'notifications',env:'API_NOTIFICATIONS_URL', methods: ['GET','PATCH'] },
  { name: 'news',        env: 'API_NEWS_URL',         methods: ['GET'] },
  { name: 'billing',     env: 'API_BILLING_URL',      methods: ['GET','POST'] },
  { name: 'charting',    env: 'API_CHARTING_URL',     methods: ['GET'] },
  { name: 'logos',       env: 'API_LOGOS_URL',        methods: ['GET'] },
  { name: 'snaptrade',   env: 'API_SNAPTRADE_URL',    methods: ['GET'] },
  { name: 'public',      env: 'API_PUBLIC_URL',       methods: ['GET'] },
];

// All sub-routes per module, enumerated explicitly.
// path is relative to /api/{module}. Gin {param} matches exactly one segment.
// url_pattern is always the full /api/{module}/{path}.
const subRoutes = {
  auth: [
    { path: 'login',                    methods: ['POST'] },
    { path: 'register',                 methods: ['POST'] },
    { path: 'me',                       methods: ['GET'] },
    { path: 'logout',                   methods: ['DELETE'] },
  ],
  users: [
    { path: '{id}',                     methods: ['GET','PATCH','DELETE'] },
    { path: 'account',                  methods: ['GET','PATCH','DELETE'] },
    { path: 'profile',                  methods: ['GET','PATCH'] },
    { path: 'change-password',          methods: ['POST'] },
    { path: 'clear-data',               methods: ['DELETE'] },
  ],
  portfolios: [
    { path: '{id}',                     methods: ['GET','PATCH','DELETE'] },
    { path: '{id}/summary-metrics',     methods: ['GET'] },
    { path: '{id}/positions',           methods: ['GET','POST'] },
    { path: '{id}/positions/bare',      methods: ['GET'] },
    { path: '{id}/positions/cfd-hints', methods: ['GET'] },
    { path: '{id}/positions/{posId}',   methods: ['PATCH','DELETE'] },
    { path: '{id}/analytics',           methods: ['GET'] },
    { path: '{id}/transactions',        methods: ['GET','POST'] },
    { path: '{id}/transactions/export', methods: ['GET'] },
    { path: '{id}/transactions/{txId}', methods: ['PATCH','DELETE'] },
    { path: '{id}/allocation',          methods: ['GET'] },
    { path: '{id}/dividends',           methods: ['GET'] },
    { path: '{id}/calendar',            methods: ['GET'] },
    { path: '{id}/news',                methods: ['GET'] },
    { path: '{id}/compare',             methods: ['GET'] },
    { path: '{id}/risk-metrics',        methods: ['GET'] },
    { path: '{id}/snapshot',            methods: ['GET'] },
    { path: 'total-metrics',            methods: ['GET'] },
    { path: 'shares',                   methods: ['GET','POST'] },
    { path: 'shares/{id}',              methods: ['DELETE'] },
    { path: 'transactions',             methods: ['GET'] },
    { path: 'held-stocks',              methods: ['GET'] },
    { path: 'light',                    methods: ['GET'] },
    { path: 'merged',                   methods: ['GET'] },
    { path: 'merged/light',             methods: ['GET'] },
  ],
  wallets: [
    { path: '{id}',                     methods: ['GET','PATCH','DELETE'] },
    { path: '{id}/balance-history',     methods: ['GET'] },
    { path: '{id}/deposits',            methods: ['GET'] },
    { path: '{id}/transactions',        methods: ['GET'] },
    { path: '{id}/transfers',           methods: ['GET'] },
    { path: '{id}/withdrawals',         methods: ['GET'] },
    { path: 'total-balance',            methods: ['GET'] },
    { path: 'recent-transactions',      methods: ['GET'] },
    { path: 'transactions/{id}',        methods: ['GET','PATCH','DELETE'] },
  ],
  instruments: [
    { path: '{symbol}',                   methods: ['GET'] },
    { path: '{symbol}/overview-metrics',  methods: ['GET'] },
    { path: '{symbol}/metrics',           methods: ['GET'] },
    { path: '{symbol}/quote',             methods: ['GET'] },
    { path: '{symbol}/profile',           methods: ['GET'] },
    { path: '{symbol}/fundamentals',      methods: ['GET'] },
    { path: '{symbol}/history',           methods: ['GET'] },
    { path: '{symbol}/dividends',         methods: ['GET'] },
    { path: '{symbol}/eps-surprises',     methods: ['GET'] },
    { path: '{symbol}/ownership',         methods: ['GET'] },
    { path: '{symbol}/projections',       methods: ['GET'] },
    { path: '{symbol}/peers',             methods: ['GET'] },
    { path: '{symbol}/compare',           methods: ['GET'] },
    { path: '{symbol}/calendar',          methods: ['GET'] },
    { path: '{symbol}/seasonality',       methods: ['GET'] },
    { path: '{symbol}/investor-relations', methods: ['GET'] },
    { path: '{symbol}/investor-relations/{eventId}/transcript', methods: ['GET'] },
    { path: 'search',                     methods: ['GET'] },
    { path: 'lookup',                     methods: ['GET'] },
  ],
  watchlists: [
    { path: '{id}',                     methods: ['GET','DELETE'] },
    { path: '{id}/items',               methods: ['GET','POST'] },
    { path: '{id}/items/{symbol}',      methods: ['DELETE'] },
  ],
  notifications: [
    { path: 'preferences',              methods: ['GET','PATCH'] },
    { path: 'symbols',                  methods: ['GET'] },
    { path: 'symbols/{symbol}',         methods: ['GET','PATCH','DELETE'] },
  ],
  news: [
    { path: 'articles',                 methods: ['GET'] },
    { path: 'stats',                    methods: ['GET'] },
  ],
  billing: [
    { path: 'plans',                    methods: ['GET'] },
    { path: 'current',                  methods: ['GET'] },
    { path: 'subscription',             methods: ['GET','POST'] },
  ],
  charting: [
    { path: 'presets',                  methods: ['GET'] },
    { path: 'compare',                  methods: ['GET'] },
  ],
  logos: [
    { path: '{symbol}',                 methods: ['GET'] },
  ],
  snaptrade: [],
  public: [],
};

const extraEndpoints = [
  { endpoint: '/api/conversations', env: 'API_COPILOT_URL', methods: ['GET','POST'] },
  { endpoint: '/api/chatbot/{path}', env: 'API_COPILOT_URL', methods: ['GET'] },
  { endpoint: '/api/exchange-rates', env: 'API_EXCHANGE_RATES_URL', methods: ['GET'] },
  { endpoint: '/api/public/portfolios/{shareId}', env: 'API_PUBLIC_URL', methods: ['GET'] },
];

let count = 0;

function envHost(envVar) {
  return `{{env "${envVar}"}}`;
}

function renderEndpoint(ep) {
  count++;
  const parts = [];
  parts.push(`    {`);
  parts.push(`      "endpoint": "${ep.endpoint}",`);
  parts.push(`      "method": "${ep.method}",`);
  parts.push(`      "output_encoding": "no-op",`);
  parts.push(`      "input_headers": ["Authorization", "Content-Type", "Accept"],`);
  parts.push(`      "backend": [{`);
  parts.push(`        "host": ["${ep.host}"],`);
  parts.push(`        "url_pattern": "${ep.url_pattern}",`);
  parts.push(`        "encoding": "no-op"`);
  parts.push(`      }]`);
  parts.push(`    }`);
  return parts.join('\n');
}

const lines = [];
lines.push('{');
lines.push('  "version": 3,');
lines.push('  "name": "portfoliost-gateway",');
lines.push('  "port": 8080,');
lines.push('  "extra_config": {');
lines.push('    "router": { "auto_options": true },');
lines.push('    "security/cors": {');
lines.push('      "allow_origins": ["http://localhost:3000", "http://localhost:8080"],');
lines.push('      "allow_methods": ["GET", "POST", "PATCH", "PUT", "DELETE"],');
lines.push('      "allow_headers": ["Authorization", "Content-Type", "Accept"]');
lines.push('    }');
lines.push('  },');
lines.push('  "endpoints": [');

const allEndpoints = [];

// Generate all endpoints from explicit sub-routes
for (const mod of modules) {
  const subs = subRoutes[mod.name] || [];

  // Base route: /api/{module}
  for (const method of mod.methods) {
    allEndpoints.push({
      endpoint: `/api/${mod.name}`,
      method,
      host: envHost(mod.env),
      url_pattern: `/api/${mod.name}`
    });
  }

  // Explicit sub-routes
  for (const sub of subs) {
    for (const method of sub.methods) {
      if (!mod.methods.includes(method)) continue;
      allEndpoints.push({
        endpoint: `/api/${mod.name}/${sub.path}`,
        method,
        host: envHost(mod.env),
        url_pattern: `/api/${mod.name}/${sub.path}`
      });
    }
  }
}

// Extra fixed-path endpoints
for (const extra of extraEndpoints) {
  for (const method of extra.methods) {
    allEndpoints.push({
      endpoint: extra.endpoint,
      method,
      host: envHost(extra.env),
      url_pattern: extra.urlPattern || extra.endpoint
    });
  }
}

// Render
const rendered = allEndpoints.map(ep => renderEndpoint(ep));
lines.push(rendered.join(',\n'));
lines.push('  ]');
lines.push('}');

const fs = require('fs');
const path = require('path');
const tmplPath = path.join(__dirname, '..', 'krakend', 'krakend.json.tmpl');
fs.writeFileSync(tmplPath, lines.join('\n') + '\n');
console.log(`Written ${allEndpoints.length} endpoints to ${tmplPath}`);

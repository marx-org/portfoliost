#!/bin/sh
set -e

# All API module URLs — default to the local mock backend.
# Override any of these to migrate individual modules to a real backend.
export API_AUTH_URL="${API_AUTH_URL:-http://example-service-mock:4010}"
export API_USERS_URL="${API_USERS_URL:-http://example-service-mock:4010}"
export API_PORTFOLIOS_URL="${API_PORTFOLIOS_URL:-http://example-service-mock:4010}"
export API_WALLETS_URL="${API_WALLETS_URL:-http://example-service-mock:4010}"
export API_INSTRUMENTS_URL="${API_INSTRUMENTS_URL:-http://example-service-mock:4010}"
export API_WATCHLISTS_URL="${API_WATCHLISTS_URL:-http://example-service-mock:4010}"
export API_NOTIFICATIONS_URL="${API_NOTIFICATIONS_URL:-http://example-service-mock:4010}"
export API_NEWS_URL="${API_NEWS_URL:-http://example-service-mock:4010}"
export API_BILLING_URL="${API_BILLING_URL:-http://example-service-mock:4010}"
export API_CHARTING_URL="${API_CHARTING_URL:-http://example-service-mock:4010}"
export API_COPILOT_URL="${API_COPILOT_URL:-http://example-service-mock:4010}"
export API_LOGOS_URL="${API_LOGOS_URL:-http://example-service-mock:4010}"
export API_EXCHANGE_RATES_URL="${API_EXCHANGE_RATES_URL:-http://example-service-mock:4010}"
export API_SNAPTRADE_URL="${API_SNAPTRADE_URL:-http://example-service-mock:4010}"
export API_PUBLIC_URL="${API_PUBLIC_URL:-http://example-service-mock:4010}"
export API_BACKEND_URL="${API_BACKEND_URL:-http://example-service-mock:4010}"

# Substitute env vars in the nginx template. The -v flag restricts
# substitution to the listed vars — nginx variables ($host, $remote_addr,
# …) are left untouched.
envsubst '${API_AUTH_URL} ${API_USERS_URL} ${API_PORTFOLIOS_URL} ${API_WALLETS_URL} ${API_INSTRUMENTS_URL} ${API_WATCHLISTS_URL} ${API_NOTIFICATIONS_URL} ${API_NEWS_URL} ${API_BILLING_URL} ${API_CHARTING_URL} ${API_COPILOT_URL} ${API_LOGOS_URL} ${API_EXCHANGE_RATES_URL} ${API_SNAPTRADE_URL} ${API_PUBLIC_URL} ${API_BACKEND_URL}' \
  < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'

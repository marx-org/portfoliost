#!/bin/sh
set -e

# Substitute environment variables in the nginx config template.
# Only ${API_BACKEND_URL} is substituted; nginx variables ($host,
# $remote_addr, …) are left untouched via the envsubst -v whitelist.
export API_BACKEND_URL="${API_BACKEND_URL:-http://example-service-mock:4010}"
envsubst '${API_BACKEND_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'

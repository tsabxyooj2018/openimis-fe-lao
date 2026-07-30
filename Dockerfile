FROM node:20 AS dev-stage

# Install system dependencies
RUN apt-get update && apt-get install -y nano openssl software-properties-common

# Generate self-signed SSL certificate
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/privkey.pem \
    -out /etc/ssl/private/fullchain.pem \
    -subj "/C=DE/ST=_/L=_/O=_/OU=_/CN=localhost"

# Set up global npm directory
RUN mkdir -p /home/node/.npm-global 
RUN chown node:node /home/node/.npm-global 
RUN npm config set prefix /home/node/.npm-global 
RUN mkdir -p  /usr/local/lib/node_modules
RUN chown node:node  /usr/local/lib/node_modules
RUN npm config set prefix  /usr/local/lib/node_modules
# Create and set permissions for /app
RUN mkdir /app
WORKDIR /app
COPY ./ /app
RUN chown node:node /app -R
# Set environment variables
ARG OPENIMIS_CONF_JSON
ENV OPENIMIS_CONF_JSON=${OPENIMIS_CONF_JSON}
ENV NODE_ENV=development
USER node
ENTRYPOINT ["/bin/bash", "/app/script/entrypoint-dev.sh"]

FROM dev-stage AS base
USER node
# Sourcemaps off by default. Upstream forces them on, which yields a 23MB map and
# pushes the React build past the ~7GB memory of a GitHub-hosted runner, killing
# the build. Pass --build-arg GENERATE_SOURCEMAP=true when debugging the bundle.
ARG GENERATE_SOURCEMAP=false
ENV GENERATE_SOURCEMAP=${GENERATE_SOURCEMAP}
ENV NODE_ENV=production
RUN npm config set prefix /home/node/.npm-global
# Pinned to the 10.x line. Upstream had `npm@latest`, which now resolves to
# npm 12 and requires node >=22 -- so this image could no longer build on the
# node:20 base above. Bump both together if the base image is ever raised.
RUN npm install -g npm@10

FROM base AS build-stage
RUN npm run load-config
RUN npm install  --include=dev --legacy-peer-deps
# Lao deployment: override fe-core's login labels. Must run after npm install
# (it patches node_modules) and before the build. See lao/apply-overrides.js for
# why this is a patch rather than a language-pack module.
RUN node ./lao/apply-overrides.js
# Register the local language-switcher module in the generated src/modules.js.
# It cannot be listed in openimis.json: load-config resolves those from npm.
RUN node ./lao/inject-language-module.js
RUN npm run build

FROM nginx:latest
COPY --from=build-stage /app/build/ /usr/share/nginx/html
COPY --from=build-stage /etc/ssl/private/ /etc/nginx/ssl/live/host
COPY ./conf /conf
COPY ./script/entrypoint.sh /script/entrypoint.sh
RUN openssl dhparam -out /etc/nginx/dhparam.pem 2048
# Strip CR before making it executable. A checkout on Windows (or any clone with
# core.autocrlf=true) gives this script CRLF endings, and bash then fails with
#   syntax error near unexpected token $'do\r'
# and the container exits on start. Harmless when the endings are already LF.
RUN sed -i 's/\r$//' /script/entrypoint.sh
RUN chmod a+x /script/entrypoint.sh
WORKDIR /script
ENV DATA_UPLOAD_MAX_MEMORY_SIZE=12582912
ENV NEW_OPENIMIS_HOST="localhost"
ENV PUBLIC_URL="front"
ENV REACT_APP_API_URL="api"
ENV REACT_APP_SENTRY_DSN=""
ENV ROOT_MOBILEAPI="rest"
ENV FORCE_RELOAD=""
ENV OPENSEARCH_PROXY_ROOT="opensearch"
ENTRYPOINT ["/bin/bash", "/script/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

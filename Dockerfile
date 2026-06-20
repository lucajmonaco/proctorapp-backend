# syntax = docker/dockerfile:1
ARG NODE_VERSION=22.21.1
FROM node:22.21.1-slim AS base
LABEL fly_launch_runtime="Node.js"
WORKDIR /app
ENV NODE_ENV="production"

FROM base AS build
RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Cache npm install separately
COPY package.json ./
RUN npm install

# Copy app code - each file separately so changes are always picked up
COPY server.js ./
# STATIC_CACHE_BUST=1781917625368
COPY public ./public

FROM base
COPY --from=build /app /app
RUN mkdir -p /data
VOLUME /data
EXPOSE 8080
CMD [ "node", "server.js" ]
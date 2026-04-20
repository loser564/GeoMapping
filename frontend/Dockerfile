# ---- Stage 1: Build React app ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install --silent

COPY public/ public/
COPY src/ src/
RUN npm run build


# ---- Stage 2: Serve with Nginx ----
FROM nginx:1.27-alpine

# Install envsubst (part of gettext)
RUN apk add --no-cache gettext

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

# Copy built React app
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx config as a template (contains ${DATAGOVSG_API_KEY})
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q --spider http://localhost/ || exit 1

# envsubst replaces ${DATAGOVSG_API_KEY} in the template at container startup,
# then nginx starts with the rendered config
CMD ["/bin/sh", "-c", \
    "envsubst '${DATAGOVSG_API_KEY}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
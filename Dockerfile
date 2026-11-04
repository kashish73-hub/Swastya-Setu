# Production Nginx image to serve static healthcare web app
FROM nginx:alpine

# Copy all static assets to Nginx html directory
COPY . /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]


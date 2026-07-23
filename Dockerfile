# ── Dockerfile ──
# Builds a self-contained image with PHP + Apache + the SQLite extension
# already installed, so `docker compose up` just works with no extra
# setup steps or manual `docker exec` commands after the fact.

# Start from the official PHP image that already bundles Apache — one
# process serves both the static files (index.html, css/, js/) AND runs
# the PHP API endpoints in api/. No separate web server needed.
FROM php:8.2-apache

# Install the SQLite PDO driver. This is the ONE thing the base php:8.2-apache
# image doesn't include by default, and it's what api/lib/db.php needs to
# open/create data/networkkb.sqlite. docker-php-ext-install is a helper
# script that ships inside all official PHP images specifically for this.
RUN docker-php-ext-install pdo_sqlite

# Apache's default document root. Copying our app here means Apache will
# serve index.html at the site root automatically.
WORKDIR /var/www/html

# Copy everything in this build context (the whole NetworkKB-v2 folder)
# into the image. See .dockerignore for what's deliberately excluded.
COPY . /var/www/html

# The PHP scripts in api/ need to create and write to data/networkkb.sqlite.
# Apache's worker processes run as user "www-data" inside this image, so
# that user needs write access to the data/ directory — without this, the
# very first "Save design" click would fail with a permissions error.
RUN chown -R www-data:www-data /var/www/html/data

# Apache in this image already listens on port 80 by default — nothing
# else to configure. EXPOSE is documentation for anyone reading this file
# (and for tools like `docker inspect`); the actual port mapping to the
# host happens in docker-compose.yml.
EXPOSE 80

FROM php:7.4-fpm-alpine

RUN set -eux; \
    apk add --no-cache \
      $PHPIZE_DEPS \
      linux-headers \
      curl-dev \
      libxml2-dev \
      bzip2-dev \
      zlib-dev \
      libzip-dev \
      icu-dev \
      gettext-dev \
      oniguruma-dev \
      freetype-dev \
      libjpeg-turbo-dev \
      libpng-dev \
      libwebp-dev \
      sqlite-dev \
      imagemagick-dev \
      libsodium-dev \
      libmemcached-dev; \
    docker-php-ext-install -j$(nproc) sockets; \
    docker-php-ext-install opcache; \
    pecl install redis memcached imagick; \
    docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp; \
    docker-php-ext-install -j$(nproc) \
      bcmath \
      bz2 \
      exif \
      gettext \
      gd \
      intl \
      mysqli \
      pdo_mysql \
      zip; \
    rm -rf /tmp/pear

RUN mkdir -p /www/conf/php.d \
    && mkdir -p /www/conf/fpm.d \
    && mkdir -p /www/ext \
    && mkdir -p /www/website \
    && mkdir -p /var/log/php \
    && echo "include=/www/conf/fpm.d/*.conf" > /usr/local/etc/php-fpm.d/zzz-www-conf.conf

ENV PHP_INI_SCAN_DIR="/usr/local/etc/php/conf.d:/www/conf/php.d"

EXPOSE 9000


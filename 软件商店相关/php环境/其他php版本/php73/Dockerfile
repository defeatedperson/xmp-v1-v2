FROM php:7.3-fpm-alpine

RUN set -eux; \
    apk add --no-cache \
      $PHPIZE_DEPS \
      linux-headers \
      curl-dev \
      libxml2-dev \
      zlib-dev \
      libzip-dev \
      oniguruma-dev \
      freetype-dev \
      libjpeg-turbo-dev \
      libpng-dev \
      libwebp-dev \
      imagemagick-dev \
      libmemcached-dev; \
    pecl install redis memcached imagick; \
    docker-php-ext-configure gd --with-freetype-dir=/usr/include/ --with-jpeg-dir=/usr/include/; \
    docker-php-ext-install -j$(nproc) \
      gd \
      mbstring \
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

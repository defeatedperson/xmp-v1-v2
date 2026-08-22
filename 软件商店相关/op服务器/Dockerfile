FROM openresty/openresty:alpine

RUN mkdir -p /www/conf \
    && mkdir -p /www/web_log \
    && mkdir -p /www/website \
    && mkdir -p /www/web-rules \
    && mkdir -p /www/lua \
    && mkdir -p /www/cache \
    && mkdir -p /www/certs \
    && mkdir -p /www/scripts \
    && mkdir -p /www/acme-data \
    && mkdir -p /var/log/openresty

COPY nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY www/lua /www/lua

COPY www/scripts /www/scripts
COPY www/50x.html /usr/local/openresty/nginx/html/50x.html

RUN chmod +x /www/scripts/*.sh \
    && sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
    && for i in 1 2 3; do apk add --no-cache curl tzdata ca-certificates openssl && break || sleep 2; done \
    && curl https://get.acme.sh | sh \
    && ln -s /root/.acme.sh/acme.sh /usr/local/bin/acme.sh \
    && acme.sh --home /www/acme-data --set-default-ca --server letsencrypt \
    && echo "0 */8 * * * /www/scripts/renew_certs.sh" >> /etc/crontabs/root \
    && echo "5 0 * * * /www/scripts/rotate_access_logs.sh" >> /etc/crontabs/root

EXPOSE 80 443

CMD ["sh", "-c", "crond && openresty -g 'daemon off;'"]

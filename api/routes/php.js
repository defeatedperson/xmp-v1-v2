const express = require('express');

const router = express.Router();

const PHP_VERSIONS_DATA = {
  "environments": [
    {
      "version": "8.4",
      "image": "defeatedperson/php:v8.4.16",
      "description": "PHP 8.4",
      "defaultPort": 9084
    },
    {
      "version": "8.5",
      "image": "defeatedperson/php:v8.5.0",
      "description": "PHP 8.5",
      "defaultPort": 9085
    },
    {
      "version": "8.1",
      "image": "defeatedperson/php:v8.1.0",
      "description": "PHP 8.1",
      "defaultPort": 9081
    },
    {
      "version": "7.4",
      "image": "defeatedperson/php:v7.4.0",
      "description": "PHP 7.4",
      "defaultPort": 9074
    },
    {
      "version": "7.41",
      "image": "defeatedperson/php:v7.4.1",
      "description": "PHP 7.4-opcache",
      "defaultPort": 9174
    },
    {
      "version": "7.2",
      "image": "defeatedperson/php:v7.2.0",
      "description": "PHP 7.2（兼容版）",
      "defaultPort": 9072
    },
    {
      "version": "7.3",
      "image": "defeatedperson/php:v7.3.0",
      "description": "PHP 7.3（兼容版）",
      "defaultPort": 9073
    }
  ],
  "extensions": [
    { "name": "redis", "mode": "pecl" },
    { "name": "imagick", "mode": "pecl" },
    { "name": "memcached", "mode": "pecl" }
  ]
};

router.get('/api/appstore/php-versions', (_req, res) => {
  res.json({ success: true, data: PHP_VERSIONS_DATA });
});

module.exports = router;


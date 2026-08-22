const fs = require('fs')
const crypto = require('crypto')
const { S3Client, HeadBucketCommand, ListObjectsV2Command, DeleteObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

function buildEndpoint(profile) {
  const raw = String(profile && profile.endpoint ? profile.endpoint : '').trim()
  if (!raw) {
    return undefined
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw
  }
  const useSSL = !!(profile && profile.useSSL)
  const scheme = useSSL ? 'https://' : 'http://'
  return scheme + raw
}

function createS3Client(profile) {
  if (!profile) {
    throw new Error('S3配置不存在')
  }
  const region = profile.region && String(profile.region).trim() ? String(profile.region).trim() : 'us-east-1'
  const endpoint = buildEndpoint(profile)
  const accessKeyId = String(profile.accessKeyId || '')
  const secretAccessKey = String(profile.secretAccessKey || '')
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3访问密钥未配置')
  }
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: !!profile.pathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  })
  attachDeleteObjectsContentMd5Middleware(client)
  const bucket = String(profile.bucket || '').trim()
  if (!bucket) {
    throw new Error('S3存储桶未配置')
  }
  return { client, bucket }
}

async function testConnection(client, bucket) {
  const command = new HeadBucketCommand({ Bucket: bucket })
  await client.send(command)
}

async function uploadObject(client, bucket, objectKey, localPath) {
  const stream = fs.createReadStream(localPath)
  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: objectKey,
      Body: stream
    }
  })
  await upload.done()
}

async function listObjectsByPrefix(client, bucket, prefix) {
  let continuationToken
  const items = []
  for (;;) {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    })
    const res = await client.send(command)
    const contents = Array.isArray(res.Contents) ? res.Contents : []
    for (const obj of contents) {
      if (!obj || !obj.Key) {
        continue
      }
      items.push({
        key: obj.Key,
        lastModified: obj.LastModified || null,
        size: obj.Size !== undefined ? obj.Size : null
      })
    }
    if (!res.IsTruncated || !res.NextContinuationToken) {
      break
    }
    continuationToken = res.NextContinuationToken
  }
  return items
}

async function deleteObjects(client, bucket, keys) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return
  }
  const maxPerRequest = 1000
  for (let i = 0; i < keys.length; i += maxPerRequest) {
    const chunk = keys.slice(i, i + maxPerRequest)
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: chunk.map(key => ({ Key: key })),
        Quiet: true
      }
    })
    await client.send(command)
  }
}

function attachDeleteObjectsContentMd5Middleware(client) {
  client.middlewareStack.add(
    next => async args => {
      const request = args.request
      if (!request || typeof request !== 'object') {
        return next(args)
      }
      const body = request.body
      if (!body || request.headers && (request.headers['content-md5'] || request.headers['Content-MD5'])) {
        return next(args)
      }
      let buffer
      if (typeof body === 'string') {
        buffer = Buffer.from(body, 'utf8')
      } else if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
        buffer = Buffer.from(body)
      } else {
        return next(args)
      }
      const md5 = crypto.createHash('md5').update(buffer).digest('base64')
      request.headers = request.headers || {}
      request.headers['content-md5'] = md5
      return next(args)
    },
    {
      step: 'build',
      name: 's3DeleteObjectsContentMd5Middleware',
      priority: 'low'
    }
  )
}

async function createPresignedUrl(client, bucket, objectKey, expireSeconds) {
  const value = Number(expireSeconds)
  const expiresIn = Number.isFinite(value) && value > 0 ? value : 3600
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey
  })
  const url = await getSignedUrl(client, command, { expiresIn })
  return url
}

module.exports = {
  createS3Client,
  testConnection,
  uploadObject,
  listObjectsByPrefix,
  deleteObjects,
  createPresignedUrl
}


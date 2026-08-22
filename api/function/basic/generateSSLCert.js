const fs = require('fs');
const path = require('path');
const os = require('os');
const forge = require('node-forge');

/**
 * 生成自签SSL证书并保存到指定目录
 * @param {string} appRoot - 应用程序根目录
 * @returns {Promise<{certPath: string, keyPath: string}>} 证书和密钥文件路径
 */
async function generateSSLCert(appRoot) {
  try {
    // 确定证书存储目录
    const certDir = path.join(appRoot, 'data', 'cert');
    
    // 创建目录（如果不存在）
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }
    
    // 生成密钥对
    const keys = forge.pki.rsa.generateKeyPair(2048);
    
    // 创建证书
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    
    // 设置证书有效期（1年）
    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    
    // 设置证书属性
    const attrs = [{
      name: 'commonName',
      value: 'localhost'
    }, {
      name: 'countryName',
      value: 'CN'
    }, {
      shortName: 'ST',
      value: 'California'
    }, {
      name: 'localityName',
      value: 'San Francisco'
    }, {
      name: 'organizationName',
      value: 'Self-Signed Certificate'
    }, {
      shortName: 'OU',
      value: 'Self-Signed Certificate'
    }];
    
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    
    // 设置基本约束扩展
    cert.setExtensions([{
      name: 'basicConstraints',
      cA: true
    }, {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    }, {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true
    }]);
    
    // 使用私钥签署证书
    cert.sign(keys.privateKey, forge.md.sha256.create());
    
    // 导出证书和私钥
    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
    
    // 定义文件路径
    const certPath = path.join(certDir, 'cert.pem');
    const keyPath = path.join(certDir, 'cert.key');
    
    // 写入文件
    fs.writeFileSync(certPath, certPem);
    fs.writeFileSync(keyPath, keyPem);
    
    // 设置私钥文件权限（仅所有者可读写）
    if (os.platform() !== 'win32') {
      fs.chmodSync(keyPath, 0o600);
    }
    
    console.log('SSL证书生成成功！');
    console.log('证书路径:', certPath);
    console.log('私钥路径:', keyPath);
    
    return { certPath, keyPath };
  } catch (error) {
    console.error('SSL证书生成失败:', error);
    throw error;
  }
}

module.exports = generateSSLCert;
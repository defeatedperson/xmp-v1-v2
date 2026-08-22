const path = require('path');

/**
 * 应用程序路径配置
 * 提供可共享的appRoot变量，由server.js设置
 */

// 初始化为null，需要由server.js设置
let appRoot = null;

/**
 * 设置应用程序根目录
 * @param {string} root - 应用程序根目录路径
 */
function setAppRoot(root) {
  appRoot = root;
}

/**
 * 获取应用程序根目录
 * @returns {string} 应用程序根目录路径
 */
function getAppRoot() {
  if (!appRoot) {
    throw new Error('appRoot未设置，请先调用setAppRoot()');
  }
  return appRoot;
}

/**
 * 获取完整路径
 * @param {...string} paths - 要拼接的路径片段
 * @returns {string} 完整路径
 */
function getPath(...paths) {
  return path.join(getAppRoot(), ...paths);
}

module.exports = {
  setAppRoot,
  getAppRoot,
  getPath
};
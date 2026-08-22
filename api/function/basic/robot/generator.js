// 验证码生成器
const storage = require('./storage');

// 生成7位随机数字
function generateRandomCode() {
  return Math.floor(1000000 + Math.random() * 9000000).toString();
}

// 生成随机颜色
function getRandomColor() {
  const colors = ['#333', '#555', '#777', '#444', '#666'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// 生成随机数
function getRandom(min, max) {
  return Math.random() * (max - min) + min;
}

// 创建复杂的验证码图片（使用SVG格式）
function createCaptchaImage(code) {
  // 将7位数字分开处理，每个字符单独定位
  const chars = code.split('');
  const charElements = chars.map((char, index) => {
    const x = 15 + index * 15 + getRandom(-3, 3);
    const y = 22 + getRandom(-3, 3);
    const rotate = getRandom(-20, 20);
    const fontSize = 18 + getRandom(-3, 3);
    const color = getRandomColor();
    
    return `<text x="${x}" y="${y}" font-family="Arial" font-size="${fontSize}" 
             text-anchor="middle" fill="${color}" 
             transform="rotate(${rotate} ${x} ${y})" 
             font-weight="${Math.random() > 0.5 ? 'bold' : 'normal'}">${char}</text>`;
  }).join('\n  ');

  // 生成干扰线
  const lines = Array.from({length: 4}, () => {
    const x1 = getRandom(0, 120);
    const y1 = getRandom(0, 40);
    const x2 = getRandom(0, 120);
    const y2 = getRandom(0, 40);
    const stroke = getRandomColor();
    const strokeWidth = getRandom(0.5, 1.5);
    
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
             stroke="${stroke}" stroke-width="${strokeWidth}" opacity="0.5"/>`;
  }).join('\n  ');

  // 生成噪点
  const dots = Array.from({length: 30}, () => {
    const cx = getRandom(0, 120);
    const cy = getRandom(0, 40);
    const r = getRandom(0.5, 1.5);
    const fill = getRandomColor();
    
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.6"/>`;
  }).join('\n  ');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="120" height="40" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f8f8f8;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f0f0f0;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="120" height="40" fill="url(#bg)"/>
  ${dots}
  ${lines}
  ${charElements}
</svg>`;
  
  return svg;
}

// 生成验证码
function generateCaptcha() {
  const code = generateRandomCode();
  storage.storeCaptcha(code);
  const image = createCaptchaImage(code);
  
  return {
    code,
    image,
    contentType: 'image/svg+xml'
  };
}

module.exports = {
  generateCaptcha
};
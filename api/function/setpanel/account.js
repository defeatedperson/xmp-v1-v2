const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getPath } = require('../../config/paths');

/**
 * 修改账户信息
 * @param {string} type - 修改类型 ('username' 或 'password')
 * @param {string} newValue - 新的明文值
 * @returns {Object} 返回对象：{ success: boolean, message: string }
 */
async function updateAccount(type, newValue) {
  try {
    // 1. 验证修改类型
    if (type !== 'username' && type !== 'password') {
      return { success: false, message: '修改类型错误，必须是 username 或 password' };
    }

    // 2. 输入格式验证（使用与登录相同的正则表达式）
    const valueRegex = /^[a-zA-Z0-9,.]+$/;
    if (!newValue || !valueRegex.test(newValue)) {
      return { success: false, message: '输入格式错误，只能包含字母、数字、逗号和点' };
    }

    // 3. 读取账户文件
    const accountPath = getPath('data', 'account.json');
    if (!fs.existsSync(accountPath)) {
      return { success: false, message: '账户文件不存在' };
    }

    let accountData;
    try {
      accountData = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
    } catch {
      return { success: false, message: '账户文件格式错误' };
    }

    // 4. 对新值进行加密处理
    const hashedValue = await bcrypt.hash(newValue, 10);

    // 5. 更新对应字段
    if (type === 'username') {
      accountData.username = hashedValue;
    } else {
      accountData.password = hashedValue;
    }

    // 6. 将修改后的数据写回文件
    fs.writeFileSync(accountPath, JSON.stringify(accountData, null, 2));

    // 7. 返回成功结果
    return { success: true, message: `${type === 'username' ? '用户名' : '密码'}修改成功` };

  } catch (error) {
    console.error('账户信息修改错误:', error);
    return { success: false, message: '系统错误' };
  }
}

module.exports = updateAccount;

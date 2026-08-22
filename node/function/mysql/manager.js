const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getPath } = require('../../config/paths');
const { dockerAdvancedManager, dockerManager } = require('../docker');
const rootAuth = require('./root-auth');

function ensureStoreDir() {
  const dir = getPath('data', 'mysql');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storeFile() {
  return path.join(ensureStoreDir(), 'dbs.json');
}

function readStore() {
  const file = storeFile();
  if (!fs.existsSync(file)) return [];
  const txt = fs.readFileSync(file, 'utf8');
  if (!txt.trim()) return [];
  try {
    const data = JSON.parse(txt);
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
}

function writeStore(entries) {
  const file = storeFile();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, file);
}

let cachedSecretKey = null;

async function getRootPassword() {
  return rootAuth.getRootPassword({ validate: false });
}

async function getTargetContainer() {
  return rootAuth.getTargetContainer();
}

function resetRootAuthCache() {
  rootAuth.resetRootAuthCache();
}
async function formatSqlWithParams(sql, params) {
  if (!Array.isArray(params) || !params.length) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => {
    const v = params[i++];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(Number(v));
    return `'${String(v).replace(/'/g, "''")}'`;
  });
}
function getSecretKey() {
  if (cachedSecretKey) return cachedSecretKey;
  const secret = process.env.PASSWORD_SECRET;
  if (!secret) throw new Error('缺少环境变量: PASSWORD_SECRET');
  cachedSecretKey = crypto.createHash('sha256').update(String(secret)).digest();
  return cachedSecretKey;
}

function encryptPassword(plain, aad) {
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, iv: iv.toString('hex'), ct: ct.toString('hex'), tag: tag.toString('hex') };
}

function decryptPassword(enc, aad) {
  const key = getSecretKey();
  const iv = Buffer.from(enc.iv, 'hex');
  const ct = Buffer.from(enc.ct, 'hex');
  const tag = Buffer.from(enc.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

async function ensurePresenceOrCleanup() {
  const name = 'mysql8';
  let exists = false;
  try {
    const list = await dockerManager.listContainers(true);
    const target = list.find(c => c && c.name === name);
    exists = !!target;
  } catch {
    exists = true;
  }
  if (!exists) {
    try {
      const f1 = storeFile();
      if (fs.existsSync(f1)) fs.unlinkSync(f1);
    } catch {}
    try {
      const f2 = path.join(rootAuth.getStoreDir(), 'root.json');
      if (fs.existsSync(f2)) fs.unlinkSync(f2);
    } catch {}
    try { resetRootAuthCache(); } catch {}
    return false;
  }
  return true;
}

async function testRootConnection() {
  try {
    await rootAuth.getRootPassword({ validate: true });
  } catch (e) {
    const msg = String(e && e.message || e || '');
    throw new Error(`ROOT_AUTH_ERROR:${msg || 'root认证失败'}`);
  }
  return true;
}

function assertSafeIdentifier(name, field = '标识符') {
  if (typeof name !== 'string' || !name) throw new Error(`${field}不能为空`);
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`${field}仅允许字母/数字/下划线`);
  return name;
}

function assertSafeCharset(value, field = '字符集') {
  if (typeof value !== 'string' || !value) throw new Error(`${field}不能为空`);
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error(`${field}不合法`);
  return value;
}

function assertSafeCollate(value, field = '排序规则') {
  if (typeof value !== 'string' || !value) throw new Error(`${field}不能为空`);
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error(`${field}不合法`);
  return value;
}

function assertSafePassword(value, field = '密码') {
  if (typeof value !== 'string' || !value) throw new Error(`${field}不能为空`);
  if (!/^[A-Za-z0-9_!@#$%^&*()\-+=.:,?]{8,128}$/.test(value)) throw new Error(`${field}不合法`);
  return value;
}

function normalizePrintable(value) {
  if (typeof value !== 'string') return '';
  return String(value).replace(/[^\x20-\x7E]/g, '').trim();
}
 

async function runSqlStatements(statements) {
  const { name, containerId } = await getTargetContainer();
  const pwd = await getRootPassword();
  const lines = [];
  for (const st of statements) {
    if (typeof st === 'string') {
      lines.push(st);
    } else if (st && typeof st.sql === 'string') {
      const sql = await formatSqlWithParams(st.sql, Array.isArray(st.params) ? st.params : []);
      lines.push(sql);
    }
  }
  const script = lines.join('\n');
  const cmd = ['bash', '-lc', `MYSQL_PWD="${pwd}" mysql -uroot <<'SQL'\n${script}\nSQL`];
  const res = await dockerAdvancedManager.executeCommand(containerId, cmd, { tty: false });
  if (!res || !res.success) throw new Error('执行SQL失败');
}

async function databaseExists(dbName) {
  const { containerId } = await getTargetContainer();
  const pwd = await getRootPassword();
  const safeDb = assertSafeIdentifier(dbName, '数据库名');
  const cmd = ['bash', '-lc', `MYSQL_PWD="${pwd}" mysql -uroot -N -s -e "SELECT 1 FROM information_schema.schemata WHERE schema_name='${safeDb}' LIMIT 1"`];
  const res = await dockerAdvancedManager.executeCommand(containerId, cmd, { tty: false });
  const out = String(res && res.output || '').trim();
  return !!out;
}

async function userExists(userName) {
  const { containerId } = await getTargetContainer();
  const pwd = await getRootPassword();
  const safeUser = assertSafeIdentifier(userName, '用户名');
  const cmd = ['bash', '-lc', `MYSQL_PWD="${pwd}" mysql -uroot -N -s -e "SELECT 1 FROM mysql.user WHERE User='${safeUser}' AND Host='%' LIMIT 1"`];
  const res = await dockerAdvancedManager.executeCommand(containerId, cmd, { tty: false });
  const out = String(res && res.output || '').trim();
  return !!out;
}

async function createDatabase({ dbName, userName, password, charset = 'utf8mb4', collate = 'utf8mb4_0900_ai_ci' }) {
  if (!dbName || !userName || !password) throw new Error('参数不完整');
  const safeDb = assertSafeIdentifier(dbName, '数据库名');
  const safeUser = assertSafeIdentifier(userName, '用户名');
  const safeCharset = assertSafeCharset(charset, '字符集');
  const safeCollate = assertSafeCollate(collate, '排序规则');
  const dbIdent = `\`${safeDb}\``;
  const safePwd = assertSafePassword(password, '密码');
  if (await databaseExists(safeDb)) throw new Error('数据库已存在');
  if (await userExists(safeUser)) throw new Error('用户名已存在');
  await runSqlStatements([
    `CREATE DATABASE ${dbIdent} CHARACTER SET ${safeCharset} COLLATE ${safeCollate};`,
    { sql: `CREATE USER ?@? IDENTIFIED BY ?;`, params: [safeUser, '%', safePwd] },
    { sql: `GRANT ALL PRIVILEGES ON ${dbIdent}.* TO ?@?;`, params: [safeUser, '%'] },
    'FLUSH PRIVILEGES;'
  ]);
  const list = readStore();
  const idx = list.findIndex(x => x && x.dbName === safeDb);
  const now = new Date().toISOString();
  const aad = `${safeDb}|${safeUser}`;
  const passwordEnc = encryptPassword(password, aad);
  const item = { id: `${safeDb}`, dbName: safeDb, userName: safeUser, passwordEnc, charset: safeCharset, collate: safeCollate, hostScope: '%', createdAt: now };
  if (idx >= 0) throw new Error('数据库已存在');
  list.push(item);
  writeStore(list);
  return { id: item.id, dbName: safeDb, userName: safeUser, password, charset: safeCharset, collate: safeCollate, hostScope: item.hostScope, createdAt: now };
}

async function listDatabases() {
  const ok = await ensurePresenceOrCleanup();
  if (!ok) return [];
  const list = readStore();
  return list.map(x => {
    if (!x) return x;
    if (x.password) return x;
    if (x.passwordEnc) {
      const aad = `${x.dbName}|${x.userName}`;
      let passwordPlain = '';
      try { passwordPlain = decryptPassword(x.passwordEnc, aad); } catch { passwordPlain = ''; }
      return { id: x.id, dbName: x.dbName, userName: x.userName, password: passwordPlain, charset: x.charset, collate: x.collate, hostScope: x.hostScope, createdAt: x.createdAt, updatedAt: x.updatedAt };
    }
    return x;
  });
}

async function deleteDatabase({ dbName, userName, dropUser = true }) {
  if (!dbName) throw new Error('参数不完整');
  const safeDb = assertSafeIdentifier(dbName, '数据库名');
  let finalUser = userName;
  if (!finalUser) {
    const list = readStore();
    const found = list.find(x => x && x.dbName === safeDb);
    if (found && found.userName) finalUser = found.userName;
  }
  const dbIdent = `\`${safeDb}\``;
  const sqlParts = [`DROP DATABASE IF EXISTS ${dbIdent};`];
  if (dropUser && finalUser) {
    const safeUser = assertSafeIdentifier(finalUser, '用户名');
    sqlParts.push({ sql: `DROP USER IF EXISTS ?@?;`, params: [safeUser, '%'] });
  }
  sqlParts.push('FLUSH PRIVILEGES;');
  await runSqlStatements(sqlParts);
  const list = readStore();
  const next = list.filter(x => !(x && x.dbName === safeDb));
  if (next.length !== list.length) writeStore(next);
  return { success: true, dbName: safeDb, userName: finalUser || '', droppedUser: !!(dropUser && finalUser) };
}

async function updateDatabasePassword({ dbName, userName, password }) {
  if (!dbName || !password) throw new Error('参数不完整');
  const safeDb = assertSafeIdentifier(dbName, '数据库名');
  let list = readStore();
  const found = list.find(x => x && x.dbName === safeDb);
  if (!found || !found.userName) throw new Error('记录不存在');
  const recordUser = assertSafeIdentifier(found.userName, '用户名');
  if (userName) {
    const reqUser = assertSafeIdentifier(userName, '用户名');
    if (reqUser !== recordUser) throw new Error('不允许修改用户名');
  }
  const safeUser = recordUser;
  const safePwd = assertSafePassword(password, '密码');
  await runSqlStatements([
    { sql: `ALTER USER ?@? IDENTIFIED BY ?;`, params: [safeUser, '%', safePwd] },
    'FLUSH PRIVILEGES;'
  ]);
  list = readStore();
  const idx = list.findIndex(x => x && x.dbName === safeDb);
  const now = new Date().toISOString();
  const aad = `${safeDb}|${safeUser}`;
  const passwordEnc = encryptPassword(password, aad);
  if (idx >= 0) {
    const prev = list[idx] || {};
    list[idx] = { ...prev, id: `${safeDb}`, dbName: safeDb, userName: safeUser, passwordEnc, updatedAt: now };
  } else {
    throw new Error('记录不存在');
  }
  writeStore(list);
  return { success: true, dbName: safeDb, userName: safeUser, password, updatedAt: now };
}

async function syncDatabasesFromServer() {
  const system = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
  const { name, containerId } = await getTargetContainer();
  const pwd = await getRootPassword();
  const resSchemas = await dockerAdvancedManager.executeCommand(containerId, ['bash', '-lc', `MYSQL_PWD="${pwd}" mysql -uroot -N -s -e "SELECT schema_name, default_character_set_name, default_collation_name FROM information_schema.schemata"`], { tty: false });
  const now = new Date().toISOString();
  const serverEntries = [];
  const serverSet = new Set();
  const lines = String(resSchemas && resSchemas.output || '').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    const parts = line.split('\t');
    const rawDb = parts[0];
    const dbName = normalizePrintable(rawDb);
    const charset = normalizePrintable(parts[1] || '');
    const collate = normalizePrintable(parts[2] || '');
    if (!dbName) continue;
    if (system.has(dbName.toLowerCase())) continue;
    if (!/^[a-zA-Z0-9_]+$/.test(dbName)) continue;
    let userName = '';
    let hostScope = '%';
    try {
      const safeDb = /^[a-zA-Z0-9_]+$/.test(dbName) ? dbName : '';
      if (safeDb) {
        const resOwn = await dockerAdvancedManager.executeCommand(containerId, ['bash', '-lc', `MYSQL_PWD="${pwd}" mysql -uroot -N -s -e "SELECT User, Host FROM mysql.db WHERE Db = '${safeDb}' LIMIT 1"`], { tty: false });
        const ln = String(resOwn && resOwn.output || '').trim().split('\n').filter(Boolean)[0];
        if (ln) {
          const ps = ln.split('\t');
          userName = normalizePrintable(ps[0] || '');
          hostScope = normalizePrintable(ps[1] || hostScope) || hostScope;
        }
      }
    } catch {}
    serverEntries.push({ dbName, userName, hostScope, charset: String(charset), collate: String(collate) });
    serverSet.add(dbName);
  }
  const local = readStore();
  const next = [];
  const added = [];
  const kept = [];
  for (const s of serverEntries) {
    const idx = local.findIndex(x => x && x.dbName === s.dbName);
    if (idx >= 0) {
      const prev = local[idx] || {};
      const hasPwd = !!prev.passwordEnc;
      next.push({
        id: `${s.dbName}`,
        dbName: s.dbName,
        userName: s.userName || prev.userName || '',
        passwordEnc: prev.passwordEnc,
        charset: s.charset || prev.charset || '',
        collate: s.collate || prev.collate || '',
        hostScope: s.hostScope || prev.hostScope || '%',
        needsReset: hasPwd ? false : true,
        createdAt: prev.createdAt || now,
        updatedAt: hasPwd ? (prev.updatedAt || now) : prev.updatedAt
      });
      kept.push(s.dbName);
    } else {
      next.push({
        id: `${s.dbName}`,
        dbName: s.dbName,
        userName: s.userName || '',
        charset: s.charset || '',
        collate: s.collate || '',
        hostScope: s.hostScope || '%',
        needsReset: true,
        createdAt: now
      });
      added.push(s.dbName);
    }
  }
  writeStore(next);
  return { success: true, added, kept, total: next.length };
}

module.exports = {
  createDatabase,
  listDatabases,
  deleteDatabase,
  updateDatabasePassword,
  resetRootAuthCache,
  syncDatabasesFromServer,
  getRootPassword,
  getTargetContainer,
  assertSafeIdentifier,
  testRootConnection
};


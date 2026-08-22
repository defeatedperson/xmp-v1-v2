const fs = require('fs');
const fsp = fs.promises;
const { getPath } = require('../../config/paths');

const CURRENT_VERSION = '2.0.0';

async function getFilePath() {
  return getPath('data', 'node', 'nodes.json');
}

async function ensureStore() {
  const dir = getPath('data', 'node');
  await fsp.mkdir(dir, { recursive: true });
  const file = await getFilePath();
  try {
    await fsp.access(file, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(file, '[]', 'utf8');
  }
}

async function readRawData() {
  await ensureStore();
  const file = await getFilePath();
  try {
    const content = await fsp.readFile(file, 'utf8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function writeRawData(data) {
  const file = await getFilePath();
  const tmp = file + '.tmp';
  const json = JSON.stringify(data, null, 2);
  await fsp.writeFile(tmp, json, 'utf8');
  await fsp.rename(tmp, file);
}

async function migrateTo200() {
  const list = await readRawData();
  if (!list.length) return false;

  if (list[0].version !== undefined) {
    return false;
  }

  const migrated = list.map((item) => {
    const { secret: _secret, ...rest } = item;
    return { ...rest, version: CURRENT_VERSION };
  });

  await writeRawData(migrated);
  console.log(`[Migrate] 节点数据已迁移至 v${CURRENT_VERSION}，清理了 ${list.length} 条记录的 secret 字段`);
  return true;
}

async function runMigrations() {
  console.log('[Migrate] 开始检查数据迁移...');

  try {
    const migrated = await migrateTo200();
    if (migrated) {
      console.log('[Migrate] 迁移完成');
    } else {
      console.log('[Migrate] 无需迁移，数据已是最新版本');
    }
  } catch (err) {
    console.error('[Migrate] 迁移失败:', err.message);
  }
}

module.exports = {
  runMigrations,
  CURRENT_VERSION
};

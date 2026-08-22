const fs = require('fs');
const fsp = fs.promises;
const { getPath } = require('../../config/paths');

function getFilePath() {
  return getPath('data', 'node', 'nodes.json');
}

async function ensureStore() {
  const dir = getPath('data', 'node');
  await fsp.mkdir(dir, { recursive: true });
  const file = getFilePath();
  try {
    await fsp.access(file, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(file, '[]', 'utf8');
  }
}

function normalizeId(id) {
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
    throw new Error('id必须为大于0的整数');
  }
  return id;
}

function normalizeAddress(address) {
  if (typeof address !== 'string' || !address.trim()) {
    throw new Error('节点地址不能为空');
  }
  const trimmed = address.trim();
  if (!/^[0-9.]+:\d+$/.test(trimmed)) {
    throw new Error('节点地址格式错误，应为 IPv4:端口号，仅允许数字、小数点和冒号');
  }
  return trimmed;
}

function now() {
  return new Date().toISOString();
}

async function readStore() {
  await ensureStore();
  const file = getFilePath();
  try {
    const content = await fsp.readFile(file, 'utf8');
    const data = JSON.parse(content);
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map((item) => ({
      id: normalizeId(item.id),
      remark: typeof item.remark === 'string' ? item.remark : '',
      type: typeof item.type === 'string' ? item.type : '',
      address: typeof item.address === 'string' ? item.address : '',
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ''
    }));
  } catch {
    await fsp.writeFile(file, '[]', 'utf8');
    return [];
  }
}

async function writeStore(data) {
  const file = getFilePath();
  const tmp = file + '.tmp';
  const json = JSON.stringify(data, null, 2);
  await fsp.writeFile(tmp, json, 'utf8');
  await fsp.rename(tmp, file);
}

async function addNode(id, type, address, remark = '') {
  const nid = normalizeId(id);
  if (typeof type !== 'string' || !type.trim()) {
    throw new Error('类型不能为空');
  }
  const nAddress = normalizeAddress(address);

  if (typeof remark === 'string' && remark.length > 10) {
    throw new Error('备注长度不能超过10个字符');
  }

  const list = await readStore();
  if (list.some((item) => item.id === nid)) {
    throw new Error('id已存在，不能重复');
  }

  const record = {
    id: nid,
    address: nAddress,
    remark: typeof remark === 'string' ? remark : '',
    type: type.trim(),
    updatedAt: now(),
    version: '2.0.0' 
  };

  list.push(record);
  await writeStore(list);
  return record;
}

async function updateNode(id, updatesOrField, value) {
  const nid = normalizeId(id);
  const list = await readStore();
  const index = list.findIndex((item) => item.id === nid);
  if (index === -1) {
    throw new Error('未找到指定id的记录');
  }

  let updates = {};
  if (typeof updatesOrField === 'string') {
    updates[updatesOrField] = value;
  } else if (updatesOrField && typeof updatesOrField === 'object') {
    updates = updatesOrField;
  } else {
    throw new Error('更新数据格式错误');
  }

  const allowed = ['remark', 'type', 'address'];
  const keys = Object.keys(updates).filter((k) => allowed.includes(k));
  if (keys.length === 0) {
    throw new Error('没有提供可更新的字段');
  }

  const record = list[index];

  if (keys.includes('remark')) {
    const r = updates.remark;
    if (r === undefined || r === null) {
      record.remark = '';
    } else if (typeof r === 'string') {
      if (r.length > 10) {
        throw new Error('备注长度不能超过10个字符');
      }
      record.remark = r;
    } else {
      throw new Error('备注必须为字符串');
    }
  }

  if (keys.includes('type')) {
    const t = updates.type;
    if (typeof t !== 'string' || !t.trim()) {
      throw new Error('类型不能为空');
    }
    record.type = t.trim();
  }

  if (keys.includes('address')) {
    record.address = normalizeAddress(updates.address);
  }

  record.updatedAt = now();
  list[index] = record;
  await writeStore(list);
  return record;
}

async function deleteNode(id) {
  const nid = normalizeId(id);
  const list = await readStore();
  const next = list.filter((item) => item.id !== nid);
  if (next.length === list.length) {
    throw new Error('未找到指定id的记录');
  }
  await writeStore(next);
  return true;
}

async function getFullList() {
  const list = await readStore();
  return list;
}

async function getIdAndTypeList() {
  const list = await readStore();
  return list.map((item) => ({
    id: item.id,
    type: item.type
  }));
}

async function getIdTypeRemarkList() {
  const list = await readStore();
  return list.map((item) => ({
    id: item.id,
    type: item.type,
    remark: item.remark && item.remark.trim() ? item.remark : '节点'
  }));
}

async function getAddressById(id) {
  const nid = normalizeId(id);
  const list = await readStore();
  const record = list.find((item) => item.id === nid);
  return record ? record.address : null;
}

async function getType1List() {
  const list = await readStore();
  return list
    .filter((item) => item.type === '1')
    .map((item) => ({
      id: item.id,
      address: item.address
    }));
}

async function getType2List() {
  const list = await readStore();
  return list
    .filter((item) => item.type === '2')
    .map((item) => ({
      id: item.id,
      address: item.address
    }));
}

async function getType3List() {
  const list = await readStore();
  return list
    .filter((item) => item.type === '3')
    .map((item) => ({
      id: item.id,
      address: item.address
    }));
}

module.exports = {
  addNode,
  updateNode,
  deleteNode,
  getFullList,
  getIdAndTypeList,
  getIdTypeRemarkList,
  getAddressById,
  getType1List,
  getType2List,
  getType3List
};

function ucs2decode(string) {
  const output = [];
  let counter = 0;
  const length = string.length;
  while (counter < length) {
    const value = string.charCodeAt(counter++);
    if (value >= 0xd800 && value <= 0xdbff && counter < length) {
      const extra = string.charCodeAt(counter++);
      if ((extra & 0xfc00) === 0xdc00) {
        output.push(((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
      } else {
        output.push(value);
        counter--;
      }
    } else {
      output.push(value);
    }
  }
  return output;
}

function digitToBasic(digit, flag) {
  return digit + 22 + 75 * (digit < 26) - ((flag !== 0) << 5);
}

function adapt(delta, numPoints, firstTime) {
  delta = firstTime ? Math.floor(delta / 700) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((36 - 1) * 26) >> 1) {
    delta = Math.floor(delta / (36 - 1));
    k += 36;
  }
  return k + Math.floor(((36 - 1 + 1) * delta) / (delta + 38));
}

function encodeLabel(input) {
  const output = [];
  input = ucs2decode(input);
  const inputLength = input.length;
  let n = 128;
  let delta = 0;
  let bias = 72;
  for (let currentValue of input) {
    if (currentValue < 0x80) {
      output.push(String.fromCharCode(currentValue));
    }
  }
  let basicLength = output.length;
  let handledCPCount = basicLength;
  if (basicLength) {
    output.push("-");
  }
  while (handledCPCount < inputLength) {
    let m = 0x10ffff;
    for (let currentValue of input) {
      if (currentValue >= n && currentValue < m) {
        m = currentValue;
      }
    }
    delta += (m - n) * (handledCPCount + 1);
    n = m;
    for (let currentValue of input) {
      if (currentValue < n) {
        delta++;
      }
      if (currentValue === n) {
        let q = delta;
        for (let k = 36; ; k += 36) {
          const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
          if (q < t) break;
          const code = t + ((q - t) % (36 - t));
          output.push(String.fromCharCode(digitToBasic(code, 0)));
          q = Math.floor((q - t) / (36 - t));
        }
        output.push(String.fromCharCode(digitToBasic(q, 0)));
        bias = adapt(delta, handledCPCount + 1, handledCPCount === basicLength);
        delta = 0;
        handledCPCount++;
      }
    }
    delta++;
    n++;
  }
  return output.join("");
}

function encodeDomainLabel(label) {
  let hasNonAscii = false;
  for (let i = 0; i < label.length; i++) {
    if (label.charCodeAt(i) > 0x7f) {
      hasNonAscii = true;
      break;
    }
  }
  if (!hasNonAscii) return label;
  return "xn--" + encodeLabel(label);
}

export function parseDomainList(input) {
  return String(input || "")
    .split(/[\n,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export function toAsciiDomain(domain) {
  const raw = String(domain || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9.-]+$/.test(raw)) return raw;
  if (raw.startsWith("*.")) {
    const rest = raw.slice(2);
    const encoded = toAsciiDomain(rest);
    return encoded ? "*." + encoded : "";
  }
  const lower = raw.toLowerCase();
  const parts = lower.split(".");
  const encodedParts = [];
  for (const part of parts) {
    if (!part) continue;
    encodedParts.push(encodeDomainLabel(part));
  }
  return encodedParts.join(".");
}

export function toAsciiDomainList(domains) {
  const result = [];
  const seen = new Set();
  for (const d of domains || []) {
    const ascii = toAsciiDomain(d);
    if (!ascii) continue;
    if (seen.has(ascii)) continue;
    seen.add(ascii);
    result.push(ascii);
  }
  return result;
}

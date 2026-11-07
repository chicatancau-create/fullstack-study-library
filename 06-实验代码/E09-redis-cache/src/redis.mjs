import net from 'node:net';

function encode(args) {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) {
    const text = String(arg);
    parts.push(`$${Buffer.byteLength(text)}\r\n${text}\r\n`);
  }
  return Buffer.from(parts.join(''), 'utf8');
}

function parse(buffer) {
  if (buffer.length === 0) return null;
  const lineEnd = buffer.indexOf('\r\n');
  if (lineEnd < 0) return null;
  const type = String.fromCharCode(buffer[0]);
  const line = buffer.subarray(1, lineEnd).toString('utf8');
  const rest = buffer.subarray(lineEnd + 2);

  if (type === '+') return { value: line, rest };
  if (type === '-') return { value: new Error(line), rest };
  if (type === ':') return { value: Number(line), rest };
  if (type === '$') {
    const length = Number(line);
    if (length === -1) return { value: null, rest };
    if (rest.length < length + 2) return null;
    return { value: rest.subarray(0, length).toString('utf8'), rest: rest.subarray(length + 2) };
  }
  if (type === '*') {
    const count = Number(line);
    if (count === -1) return { value: null, rest };
    const values = [];
    let cursor = rest;
    for (let i = 0; i < count; i += 1) {
      const parsed = parse(cursor);
      if (!parsed) return null;
      values.push(parsed.value);
      cursor = parsed.rest;
    }
    return { value: values, rest: cursor };
  }
  throw new Error(`未知 RESP 类型: ${type}`);
}

export function command(port, ...args) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let buffer = Buffer.alloc(0);
    let selected = false;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Redis 命令超时'));
    }, 3000);

    socket.on('connect', () => socket.write(encode(['SELECT', '15'])));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        let parsed;
        try {
          parsed = parse(buffer);
        } catch (error) {
          clearTimeout(timer);
          socket.destroy();
          reject(error);
          return;
        }
        if (!parsed) return;
        buffer = parsed.rest;
        if (parsed.value instanceof Error) {
          clearTimeout(timer);
          socket.destroy();
          reject(parsed.value);
          return;
        }
        if (!selected) {
          selected = true;
          socket.write(encode(args));
          continue;
        }
        clearTimeout(timer);
        socket.destroy();
        resolve(parsed.value);
        return;
      }
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
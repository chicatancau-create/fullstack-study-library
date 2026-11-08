import process from 'node:process';

const tasks = new Map();

async function runTask(id, ms, signal) {
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      }, { once: true });
    });
    return 'done';
  } finally {
    tasks.delete(id);
  }
}

process.on('message', (message) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'run') {
    const controller = new AbortController();
    tasks.set(message.id, controller);
    runTask(message.id, Number(message.ms) || 0, controller.signal)
      .then((status) => process.send({ id: message.id, status }))
      .catch(() => process.send({ id: message.id, status: 'cancelled' }));
  }
  if (message.type === 'cancel') {
    tasks.get(message.id)?.abort();
  }
});

process.send({ type: 'ready', pid: process.pid });

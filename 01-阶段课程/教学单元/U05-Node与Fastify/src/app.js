import Fastify from 'fastify';

const recordSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'minutes'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 60 },
    minutes: { type: 'integer', minimum: 0 },
  },
};

export function buildApp({ logger = false, seed = [] } = {}) {
  const app = Fastify({
    logger,
    bodyLimit: 8192,
    // Fastify 默认 removeAdditional=true 会静默删掉额外字段；这里显式改为拒绝。
    ajv: { customOptions: { removeAdditional: false } },
  });
  const records = seed.map((record) => ({ ...record }));
  let nextId = records.reduce((max, record) => Math.max(max, record.id), 0) + 1;

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/records', async () => ({ items: records }));

  app.get('/records/:id', async (request, reply) => {
    const record = records.find((item) => item.id === Number(request.params.id));
    if (!record) return reply.code(404).send({ error: 'not_found' });
    return record;
  });

  app.post('/records', { schema: { body: recordSchema } }, async (request, reply) => {
    const record = { id: nextId, title: request.body.title, minutes: request.body.minutes };
    nextId += 1;
    records.push(record);
    return reply.code(201).send(record);
  });

  app.delete('/records/:id', async (request, reply) => {
    const index = records.findIndex((item) => item.id === Number(request.params.id));
    if (index < 0) return reply.code(404).send({ error: 'not_found' });
    records.splice(index, 1);
    return reply.code(204).send();
  });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'validation_failed', message: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal_error' });
  });

  return app;
}
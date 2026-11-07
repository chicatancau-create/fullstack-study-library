import amqp from 'amqplib';

export const EXCHANGE = 'e10.ex';
export const DLX = 'e10.dlx';
export const QUEUE = 'e10.q';
export const DLQ = 'e10.dlq';
export const ROUTING = 'order';

export async function connectBroker() {
  const connection = await amqp.connect(process.env.AMQP_URL || 'amqp://guest:guest@127.0.0.1:5672');
  const channel = await connection.createChannel();
  return { connection, channel };
}

export async function resetBroker(channel) {
  await channel.deleteQueue(QUEUE).catch(() => {});
  await channel.deleteQueue(DLQ).catch(() => {});
  await channel.deleteExchange(EXCHANGE).catch(() => {});
  await channel.deleteExchange(DLX).catch(() => {});
  await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(DLX, 'direct', { durable: true });
  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': DLX },
  });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING);
  await channel.bindQueue(DLQ, DLX, ROUTING);
}

export function publish(channel, event) {
  return channel.publish(EXCHANGE, ROUTING, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    messageId: event.id,
    contentType: 'application/json',
  });
}

export async function getOne(channel, timeoutMs = 2000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const message = await channel.get(QUEUE, { noAck: false });
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}
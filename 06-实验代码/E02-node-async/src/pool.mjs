/**
 * E02 任务池：并发上限 + 排队上限 + 超时 + 取消。
 *
 * 三条不妥协的语义（README 第 6–9 节各有对应证据，请不要凭直觉改写）：
 *
 * 1. 取消与超时只让「调用方停止等待」，不会撤销底层正在执行的函数。
 *    JS 没有抢占式取消：没有 await 的同步代码、已经发出的网络请求、已经提交的写操作，
 *    都不会因为 Promise 被 reject 而回滚。底层函数真正结算前，它占用的并发槽位不释放，
 *    否则实际并发数会超过 concurrency —— 那是另一种失控。
 *
 * 2. 队列有硬上限。满了立刻拒绝（E_QUEUE_FULL），不静默膨胀。
 *    需要「等位」而不是「拒绝」时，生产方先 await waitForSlot()，把压力传回生产端。
 *
 * 3. failFast 只影响「尚未开始」的任务。已在执行的不会被抢占，它要么跑完，
 *    要么由它自己的 signal 去协商中止。
 */

export const POOL_CODES = Object.freeze({
  QUEUE_FULL: 'E_QUEUE_FULL',
  CLOSED: 'E_POOL_CLOSED',
  DISCARDED: 'E_POOL_DISCARDED',
  CANCELLED: 'E_POOL_CANCELLED',
  TIMEOUT: 'E_POOL_TIMEOUT',
});

export class PoolError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'PoolError';
    this.code = code;
    Object.assign(this, extra);
  }
}

let nextTaskId = 0;

export class TaskPool {
  #concurrency;
  #maxQueue;
  #failFast;
  #name;

  #queue = [];
  #running = new Map();
  #closed = false;
  #firstError = null;
  #failFastTriggered = false;
  #failFastSnapshot = null;
  #idleWaiters = [];
  #slotWaiters = [];
  #stats;

  constructor({ concurrency = 1, maxQueue = Infinity, failFast = false, name = 'pool' } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError(`concurrency 必须是 >=1 的整数，收到 ${concurrency}`);
    }
    if (!(maxQueue === Infinity || (Number.isInteger(maxQueue) && maxQueue >= 0))) {
      throw new RangeError(`maxQueue 必须是 >=0 的整数或 Infinity，收到 ${maxQueue}`);
    }
    this.#concurrency = concurrency;
    this.#maxQueue = maxQueue;
    this.#failFast = failFast;
    this.#name = name;
    this.#stats = {
      submitted: 0,
      started: 0,
      fulfilled: 0,
      rejected: 0,
      timeouts: 0,
      cancelledQueued: 0,
      cancelledRunning: 0,
      rejectedQueueFull: 0,
      discardedByFailFast: 0,
      rejectedAfterClose: 0,
      lateAfterTimeout: 0,
      lateAfterCancel: 0,
      peakRunning: 0,
      peakQueue: 0,
    };
  }

  get concurrency() {
    return this.#concurrency;
  }

  get name() {
    return this.#name;
  }

  /**
   * 提交一个任务。
   * @param {(task: object) => any} fn 任务函数；返回值会被 Promise 化
   * @param {{signal?: AbortSignal, timeoutMs?: number, label?: string}} [options]
   * @returns {Promise<any>} 调用方视角的结算承诺（可能先于底层函数结算）
   */
  submit(fn, { signal = null, timeoutMs = null, label = '' } = {}) {
    if (typeof fn !== 'function') throw new TypeError('submit 需要函数');
    if (timeoutMs !== null && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
      throw new RangeError(`timeoutMs 必须是 >=0 的有限数或 null，收到 ${timeoutMs}`);
    }
    if (
      signal !== null &&
      (typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' ||
        typeof signal.removeEventListener !== 'function')
    ) {
      throw new TypeError('signal 必须是 AbortSignal（或等价实现）或 null');
    }
    const id = ++nextTaskId;
    const task = {
      id,
      label: label || `task#${id}`,
      fn,
      signal,
      timeoutMs,
      state: 'new',
      submittedAt: Date.now(),
      startedAt: null,
      settledAt: null,
      underlyingFinishedAt: null,
      underlyingOutcome: null,
      timedOut: false,
      cancelReason: null,
      settled: false,
      timer: null,
      onAbort: null,
      resolve: null,
      reject: null,
    };
    this.#stats.submitted++;

    const promise = new Promise((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });

    if (this.#closed) {
      task.state = 'rejected-closed';
      this.#stats.rejectedAfterClose++;
      this.#settleReject(task, new PoolError(POOL_CODES.CLOSED, `${task.label}: 池已关闭，不再接收新任务`, { id }));
      return promise;
    }
    if (this.#failFastTriggered) {
      task.state = 'rejected-failfast';
      this.#stats.discardedByFailFast++;
      this.#settleReject(
        task,
        new PoolError(POOL_CODES.DISCARDED, `${task.label}: 池已因首个失败停止接收`, { id, cause: this.#firstError }),
      );
      return promise;
    }
    if (signal && signal.aborted) {
      task.state = 'cancelled-before-start';
      task.cancelReason = signal.reason;
      this.#stats.cancelledQueued++;
      this.#settleReject(
        task,
        new PoolError(POOL_CODES.CANCELLED, `${task.label}: 提交时 signal 已中止，未入队`, {
          id,
          reason: signal.reason,
          underlyingStillRunning: false,
        }),
      );
      return promise;
    }

    const hasFreeSlot = this.#running.size < this.#concurrency;
    if (!hasFreeSlot && this.#queue.length >= this.#maxQueue) {
      task.state = 'rejected-queue-full';
      this.#stats.rejectedQueueFull++;
      this.#settleReject(
        task,
        new PoolError(POOL_CODES.QUEUE_FULL, `${task.label}: 队列已满（maxQueue=${this.#maxQueue}），拒绝承载`, {
          id,
          maxQueue: this.#maxQueue,
        }),
      );
      return promise;
    }

    task.state = 'queued';
    this.#queue.push(task);
    if (signal) {
      task.onAbort = () => this.#abortTask(task, signal.reason);
      signal.addEventListener('abort', task.onAbort, { once: true });
    }
    this.#pump();
    // 记录排队峰值（在 pump 之后取，避免「有空槽时的瞬时入队」被算成积压）
    if (this.#queue.length > this.#stats.peakQueue) this.#stats.peakQueue = this.#queue.length;
    return promise;
  }

  /**
   * 等一个空位再提交，实现「把压力传回生产端」的背压。
   * 队列未满时立即返回；队列已满则等到有任务离开队列（开始执行或被取消）。
   */
  waitForSlot() {
    if (this.#closed || this.#failFastTriggered) return Promise.resolve();
    if (this.#running.size < this.#concurrency) return Promise.resolve();
    if (this.#queue.length < this.#maxQueue) return Promise.resolve();
    return new Promise((resolve) => this.#slotWaiters.push(resolve));
  }

  /** 等池完全空闲：队列为空且没有任何底层函数仍在执行。 */
  drain({ timeoutMs = null } = {}) {
    if (timeoutMs !== null && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
      return Promise.reject(new RangeError(`drain timeoutMs 必须是 >=0 的有限数或 null，收到 ${timeoutMs}`));
    }
    if (this.#isIdle()) return Promise.resolve();
    if (timeoutMs == null) return new Promise((resolve) => this.#idleWaiters.push(resolve));

    return new Promise((resolve, reject) => {
      const waiter = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const index = this.#idleWaiters.indexOf(waiter);
        if (index >= 0) this.#idleWaiters.splice(index, 1);
        reject(
          new PoolError(
            POOL_CODES.TIMEOUT,
            `drain 超过 ${timeoutMs}ms 仍未空闲（running=${this.#running.size}，queued=${this.#queue.length}）`,
          ),
        );
      }, timeoutMs);
      this.#idleWaiters.push(waiter);
    });
  }

  /** 停止接收新任务；排队中的任务不执行，直接拒绝。已在执行的允许跑完。
   *  不提供 dropQueued:false：关闭后队列不会再有 pump，留下队列等于永久 pending。 */
  close() {
    this.#closed = true;
    const queued = this.#queue.splice(0, this.#queue.length);
    for (const task of queued) {
      task.state = 'rejected-closed';
      this.#stats.rejectedAfterClose++;
      this.#detachAbort(task);
      this.#settleReject(
        task,
        new PoolError(POOL_CODES.CLOSED, `${task.label}: 池关闭时仍在排队，未执行`, { id: task.id }),
      );
    }
    this.#notifySlot();
    this.#maybeIdle();
    return this.stats();
  }

  /** 取消排队中与执行中的全部任务：调用方立即停止等待，底层函数各自跑完为止。 */
  cancelAll(reason = 'pool.cancelAll') {
    const targets = [...this.#queue, ...this.#running.values()];
    for (const task of targets) this.#abortTask(task, reason);
    return targets.length;
  }

  /** 便于证据脚本读取的一致快照。 */
  stats() {
    return {
      name: this.#name,
      concurrency: this.#concurrency,
      maxQueue: this.#maxQueue === Infinity ? 'Infinity' : this.#maxQueue,
      failFast: this.#failFast,
      failFastTriggered: this.#failFastTriggered,
      closed: this.#closed,
      running: this.#running.size,
      queued: this.#queue.length,
      pending: this.#running.size + this.#queue.length,
      idleWaiters: this.#idleWaiters.length,
      slotWaiters: this.#slotWaiters.length,
      firstError: this.#failFastTriggered
        ? {
            name: this.#firstError?.name ?? 'NonError',
            message: this.#firstError?.message ?? String(this.#firstError),
          }
        : null,
      failFastSnapshot: this.#failFastSnapshot,
      ...this.#stats,
    };
  }

  /** 当前执行中与排队中的任务概要，用于证据。 */
  snapshot() {
    const view = (t) => ({ id: t.id, label: t.label, state: t.state, settled: t.settled });
    return {
      running: [...this.#running.values()].map(view),
      queued: this.#queue.map(view),
    };
  }

  // ---------------- 内部 ----------------

  #isIdle() {
    return this.#running.size === 0 && this.#queue.length === 0;
  }

  #pump() {
    while (!this.#closed && !this.#failFastTriggered && this.#running.size < this.#concurrency && this.#queue.length > 0) {
      const task = this.#queue.shift();
      this.#notifySlot();
      this.#start(task);
    }
    this.#maybeIdle();
  }

  #start(task) {
    task.state = 'running';
    task.startedAt = Date.now();
    this.#stats.started++;
    this.#running.set(task.id, task);
    if (this.#running.size > this.#stats.peakRunning) this.#stats.peakRunning = this.#running.size;

    if (task.timeoutMs != null && Number.isFinite(task.timeoutMs) && task.timeoutMs >= 0) {
      task.timer = setTimeout(() => this.#onTimeout(task), task.timeoutMs);
    }

    let result;
    try {
      result = task.fn(task);
    } catch (error) {
      this.#finish(task, false, error);
      return;
    }
    Promise.resolve(result).then(
      (value) => this.#finish(task, true, value),
      (error) => this.#finish(task, false, error),
    );
  }

  #onTimeout(task) {
    if (task.settled) return;
    task.timedOut = true;
    task.state = 'timed-out';
    this.#stats.timeouts++;
    this.#detachAbort(task);
    this.#settleReject(
      task,
      new PoolError(
        POOL_CODES.TIMEOUT,
        `${task.label}: 超过 ${task.timeoutMs}ms，调用方停止等待；底层操作未被撤销`,
        { id: task.id, timeoutMs: task.timeoutMs, underlyingStillRunning: true },
      ),
    );
  }

  #abortTask(task, reason) {
    if (task.state === 'queued') {
      const index = this.#queue.indexOf(task);
      if (index >= 0) this.#queue.splice(index, 1);
      task.state = 'cancelled-queued';
      this.#stats.cancelledQueued++;
      this.#detachAbort(task);
      this.#settleReject(
        task,
        new PoolError(POOL_CODES.CANCELLED, `${task.label}: 排队中被取消，未开始执行`, {
          id: task.id,
          reason,
          underlyingStillRunning: false,
        }),
      );
      this.#notifySlot();
      this.#maybeIdle();
      return;
    }
    if (task.state === 'running' || task.state === 'timed-out') {
      if (!this.#running.has(task.id)) return;
      this.#detachAbort(task);
      task.cancelReason = reason;
      if (task.state === 'timed-out') {
        return; /* 已超时结算；这里只清理监听器，不重复 settle */
      }
      task.state = 'cancelled-running';
      this.#stats.cancelledRunning++;
      this.#settleReject(
        task,
        new PoolError(POOL_CODES.CANCELLED, `${task.label}: 执行中被取消；调用方不再等待，底层函数仍在跑`, {
          id: task.id,
          reason,
          underlyingStillRunning: true,
        }),
      );
    }
  }

  #detachAbort(task) {
    if (task.signal && task.onAbort) {
      task.signal.removeEventListener('abort', task.onAbort);
      task.onAbort = null;
    }
  }

  #finish(task, ok, payload) {
    task.underlyingFinishedAt = Date.now();
    task.underlyingOutcome = ok ? 'fulfilled' : 'rejected';
    if (task.timer) {
      clearTimeout(task.timer);
      task.timer = null;
    }
    if (task.signal && task.onAbort) this.#detachAbort(task);
    this.#running.delete(task.id);
    this.#notifySlot();

    if (!task.settled) {
      if (ok) {
        this.#settleResolve(task, payload);
      } else {
        this.#settleReject(task, payload);
        if (this.#failFast && !this.#failFastTriggered) this.#onFirstError(payload, task);
      }
    } else if (task.timedOut) {
      this.#stats.lateAfterTimeout++;
    } else {
      this.#stats.lateAfterCancel++;
    }

    this.#pump();
  }

  #onFirstError(error, failedTask) {
    this.#firstError = error;
    this.#failFastTriggered = true;
    const dropped = this.#queue.splice(0, this.#queue.length);
    const stillRunning = [...this.#running.values()].map((t) => ({
      id: t.id,
      label: t.label,
      state: t.state,
      settled: t.settled,
    }));
    for (const task of dropped) {
      task.state = 'discarded-failfast';
      this.#detachAbort(task);
      this.#stats.discardedByFailFast++;
      this.#settleReject(
        task,
        new PoolError(POOL_CODES.DISCARDED, `${task.label}: 因首个失败被丢弃，未开始执行`, {
          id: task.id,
          cause: error,
        }),
      );
    }
    this.#failFastSnapshot = {
      failedTask: { id: failedTask.id, label: failedTask.label },
      error: { name: error?.name ?? 'NonError', message: error?.message ?? String(error) },
      runningAtFailure: stillRunning,
      queuedAtFailure: dropped.map((t) => t.label),
      queuedCountAtFailure: dropped.length,
      discardedCount: dropped.length,
    };
    this.#notifySlot();
    this.#maybeIdle();
  }

  #settleResolve(task, value) {
    if (task.settled) return false;
    task.settled = true;
    task.settledAt = Date.now();
    this.#stats.fulfilled++;
    task.resolve(value);
    return true;
  }

  #settleReject(task, error) {
    if (task.settled) return false;
    task.settled = true;
    task.settledAt = Date.now();
    this.#stats.rejected++;
    task.reject(error);
    return true;
  }

  #notifySlot() {
    if (this.#slotWaiters.length === 0) return;
    const waiters = this.#slotWaiters.splice(0, this.#slotWaiters.length);
    for (const resolve of waiters) resolve();
  }

  #maybeIdle() {
    if (!this.#isIdle()) return;
    if (this.#idleWaiters.length === 0) return;
    const waiters = this.#idleWaiters.splice(0, this.#idleWaiters.length);
    for (const resolve of waiters) resolve();
  }
}

import { EventEmitter } from 'node:events';

const states = ['pending', 'running', 'completed', 'failed', 'cancelled'] ;

let taskIdCounter = 0;

export class Task {
  constructor({ name, executor, priority = 0, metadata = {} }) {
    this.id = `task-${++taskIdCounter}-${Date.now()}`;
    this.name = name;
    this.executor = executor;
    this.priority = priority;
    this.metadata = metadata;
    this.status = 'pending';
    this.createdAt = new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.result = null;
    this.error = null;
    this.progress = { current: 0, total: 0, message: '' };
  }
}

export class TaskQueue extends EventEmitter {
  constructor({ concurrency = 2 } = {}) {
    super();
    this.concurrency = concurrency;
    this._queue = [];
    this._running = new Map();
    this._completed = [];
    this._maxCompleted = 100;
  }

  enqueue({ name, executor, priority = 0, metadata = {} }) {
    const task = new Task({ name, executor, priority, metadata });
    this._queue.push(task);
    this._queue.sort((a, b) => b.priority - a.priority);
    this.emit('enqueued', task);
    this._drain();
    return task;
  }

  cancel(taskId) {
    const idx = this._queue.findIndex(t => t.id === taskId);
    if (idx !== -1) {
      const task = this._queue[idx];
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      this._queue.splice(idx, 1);
      this._completed.push(task);
      this.emit('cancelled', task);
      return true;
    }
    const running = this._running.get(taskId);
    if (running) {
      running.status = 'cancelled';
      running.completedAt = new Date().toISOString();
      this._running.delete(taskId);
      this._completed.push(running);
      this.emit('cancelled', running);
      this._drain();
      return true;
    }
    return false;
  }

  clear() {
    for (const task of this._queue) {
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      this._completed.push(task);
    }
    this._queue = [];
    this.emit('cleared');
  }

  list() {
    return {
      pending: [...this._queue],
      running: [...this._running.values()],
      completed: this._completed.slice(-this._maxCompleted),
    };
  }

  getStatus(taskId) {
    const pending = this._queue.find(t => t.id === taskId);
    if (pending) return pending;
    const running = this._running.get(taskId);
    if (running) return running;
    return this._completed.find(t => t.id === taskId) || null;
  }

  get stats() {
    return {
      pending: this._queue.length,
      running: this._running.size,
      completed: this._completed.length,
      total: this._queue.length + this._running.size + this._completed.length,
    };
  }

  async _drain() {
    while (this._running.size < this.concurrency && this._queue.length > 0) {
      const task = this._queue.shift();
      this._running.set(task.id, task);
      this._execute(task);
    }
  }

  async _execute(task) {
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.emit('start', task);

    try {
      const result = await task.executor({
        onProgress: (current, total, message) => {
          task.progress = { current, total, message: message || '' };
          this.emit('progress', task);
        }
      });
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date().toISOString();
      this.emit('complete', task);
    } catch (err) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = new Date().toISOString();
      this.emit('fail', task);
    } finally {
      this._running.delete(task.id);
      this._completed.push(task);
      if (this._completed.length > this._maxCompleted) {
        this._completed.splice(0, this._completed.length - this._maxCompleted);
      }
      this._drain();
    }
  }
}

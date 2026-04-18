const queues = new Map<string, ActionQueue>();

export class ActionQueue {
  private tail: Promise<unknown> = Promise.resolve();

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.catch(() => undefined).then(fn);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async drain(): Promise<void> {
    await this.tail;
  }
}

export const getQueue = (tabId: string): ActionQueue => {
  const existing = queues.get(tabId);
  if (existing) {
    return existing;
  }

  const created = new ActionQueue();
  queues.set(tabId, created);
  return created;
};

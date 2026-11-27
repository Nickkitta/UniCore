import { Logger } from '@nestjs/common';
import type { Db } from '../db/database.js';
import { databaseCheckTimeoutMs, HealthService } from './health.service.js';

function serviceWith(execute: () => Promise<unknown>) {
  return new HealthService({ execute } as unknown as Db);
}

describe('HealthService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports a database that answers', async () => {
    await expect(serviceWith(() => Promise.resolve([])).isDatabaseUp()).resolves.toBe(true);
  });

  it('reports a database that fails and logs the driver error', async () => {
    const failure = new Error('Failed query: select 1', {
      cause: new Error('connect ECONNREFUSED'),
    });
    const service = serviceWith(() => Promise.reject(failure));
    await expect(service.isDatabaseUp()).resolves.toBe(false);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      'Database check failed: Failed query: select 1 (connect ECONNREFUSED)',
    );
  });

  it('gives up on a database that does not answer in time', async () => {
    vi.useFakeTimers();
    const result = serviceWith(() => new Promise(() => undefined)).isDatabaseUp();
    await vi.advanceTimersByTimeAsync(databaseCheckTimeoutMs);
    await expect(result).resolves.toBe(false);
  });
});

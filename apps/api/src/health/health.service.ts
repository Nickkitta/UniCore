import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/database.js';

/** Drizzle wraps driver errors in "Failed query: …"; the reason (e.g. ECONNREFUSED) is the cause. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause ? `${error.message} (${describe(error.cause)})` : error.message;
}

/** A database that doesn't answer within this time counts as down. */
export const databaseCheckTimeoutMs = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@InjectDrizzle() private readonly db: Db) {}

  /** Runs `SELECT 1`; an error or a timeout means the database is down. */
  async isDatabaseUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer in ${databaseCheckTimeoutMs} ms`)),
        databaseCheckTimeoutMs,
      );
    });
    try {
      await Promise.race([this.db.execute(sql`select 1`), timeout]);
      return true;
    } catch (error) {
      this.logger.warn(`Database check failed: ${describe(error)}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

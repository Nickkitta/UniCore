import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  // Task 2.3 adds a `SELECT 1` here and reports 503 when the database is down.
  check() {
    return { ok: true } as const;
  }
}

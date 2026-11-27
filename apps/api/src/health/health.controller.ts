import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthResponse } from '@unicore/shared';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  // Injected by type, without @Inject: this only works when the compiler emits
  // decorator metadata, so the health e2e test also guards the build setup.
  constructor(private readonly health: HealthService) {}

  /**
   * `{ ok: true }`, or 503 with `{ ok: false }` when the database is down. The status is set
   * here rather than thrown, so the response keeps this shape and not the error format.
   */
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const ok = await this.health.isDatabaseUp();
    if (!ok) response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { ok };
  }
}

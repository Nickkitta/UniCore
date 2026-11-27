import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  // Injected by type, without @Inject: this only works when the compiler emits
  // decorator metadata, so the health e2e test also guards the build setup.
  constructor(private readonly health: HealthService) {}

  @Get()
  check() {
    return this.health.check();
  }
}

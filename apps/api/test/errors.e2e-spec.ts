import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
  Post,
} from '@nestjs/common';
import { errorMessages } from '@unicore/shared';
import { DomainError } from '../src/common/domain-error.js';
import { createTestApp, type TestApp } from './app.js';

/** Throws what services, guards and Nest packages throw in stages 3–5. */
@Controller('test-errors')
class ProbeController {
  @Get('domain')
  domain() {
    throw new DomainError('UNICORE_FULL');
  }

  @Get('crash')
  crash() {
    throw new Error('secret detail: relation "users" does not exist');
  }

  @Get('throttled')
  throttled() {
    // What ThrottlerException of @nestjs/throttler (3.7) is.
    throw new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  @Get('too-large')
  tooLarge() {
    // What FileInterceptor (5.2) throws for a file over limits.fileSize.
    throw new PayloadTooLargeException('File too large');
  }

  @Get('forbidden')
  forbidden() {
    // What Nest throws when a guard returns false.
    throw new ForbiddenException();
  }

  @Post('echo')
  echo(@Body() body: unknown) {
    return body;
  }
}

describe('errors', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await t.close();
  });

  const http = () => t.http();

  it('answers an unknown route with 404 UNICORE_NOT_FOUND', async () => {
    const response = await http().get('/v1/nope').expect(404);
    expect(response.body).toEqual({
      error: { code: 'UNICORE_NOT_FOUND', message: 'Cannot GET /v1/nope' },
    });
  });

  it('answers a DomainError with the status of its code', async () => {
    const response = await http().get('/v1/test-errors/domain').expect(409);
    expect(response.body).toEqual({
      error: { code: 'UNICORE_FULL', message: errorMessages.UNICORE_FULL },
    });
  });

  it('hides an unknown error behind 500 UNICORE_INTERNAL', async () => {
    const response = await http().get('/v1/test-errors/crash').expect(500);
    expect(response.body).toEqual({
      error: { code: 'UNICORE_INTERNAL', message: 'Internal server error' },
    });
    expect(response.text).not.toMatch(/secret detail|users|\bat /);
  });

  it('maps the rate limit to 429 UNICORE_RATE_LIMIT', async () => {
    const response = await http().get('/v1/test-errors/throttled').expect(429);
    expect(response.body.error.code).toBe('UNICORE_RATE_LIMIT');
  });

  it('maps a file over the limit to 413 UNICORE_FILE_TOO_LARGE', async () => {
    const response = await http().get('/v1/test-errors/too-large').expect(413);
    expect(response.body.error.code).toBe('UNICORE_FILE_TOO_LARGE');
  });

  it('maps a JSON body over the 100 KB of Express to 413 UNICORE_FILE_TOO_LARGE', async () => {
    const response = await http()
      .post('/v1/test-errors/echo')
      .send({ text: 'x'.repeat(200 * 1024) })
      .expect(413);
    expect(response.body.error.code).toBe('UNICORE_FILE_TOO_LARGE');
  });

  it('answers malformed JSON with 422 UNICORE_INVALID_INPUT', async () => {
    const response = await http()
      .post('/v1/test-errors/echo')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(422);
    expect(response.body.error.code).toBe('UNICORE_INVALID_INPUT');
  });

  it('maps a forbidden request to 403 UNICORE_FORBIDDEN', async () => {
    const response = await http().get('/v1/test-errors/forbidden').expect(403);
    expect(response.body.error.code).toBe('UNICORE_FORBIDDEN');
  });

  it('tags every response under /v1 with a request id', async () => {
    const ok = await http().get('/v1/health').expect(200);
    const failed = await http().get('/v1/nope').expect(404);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(ok.headers['x-request-id']).toMatch(uuid);
    expect(failed.headers['x-request-id']).toMatch(uuid);
    expect(ok.headers['x-request-id']).not.toBe(failed.headers['x-request-id']);
  });
});

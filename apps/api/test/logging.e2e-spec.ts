import { Writable } from 'node:stream';
import { Body, Controller, Get, HttpCode, Logger, Post } from '@nestjs/common';
import { PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import { DomainError } from '../src/common/domain-error.js';
import { loggerParams } from '../src/common/logger.params.js';
import { createTestApp, type TestApp } from './app.js';

// This file builds a single app: nestjs-pino keeps one pino-http instance per process,
// made from the params of the first app, so a second app here would log to the same stream.

@Controller('test-logs')
class ProbeController {
  private readonly logger = new Logger('Probe');

  /** Logs the body the way careless code would; the redaction paths must catch it. */
  @Post('echo')
  @HttpCode(204)
  echo(@Body() body: unknown) {
    this.logger.log({ body }, 'got a body');
  }

  @Get('full')
  full() {
    throw new DomainError('UNICORE_FULL');
  }

  @Get('crash')
  crash() {
    throw new Error('database exploded');
  }
}

type LogLine = {
  level: number;
  msg?: string;
  errorCode?: string;
  req?: { id: string; url: string; headers: Record<string, string>; query: Record<string, string> };
  res?: { statusCode: number };
  err?: { message: string; stack: string };
  body?: Record<string, string>;
};

const secrets = ['ACCESS-SECRET', 'SIG-SECRET', 'TOKEN-SECRET', 'PASS-SECRET', 'REFRESH-SECRET'];

describe('logging', () => {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(...chunk.toString().split('\n').filter(Boolean));
      callback();
    },
  });
  const parsed = () => lines.map((line) => JSON.parse(line) as LogLine);
  /** pino-http writes the line when the response is finished, maybe after supertest resolves. */
  const lineOf = (requestId: string) =>
    vi.waitFor(() => {
      const line = parsed().find((entry) => entry.req?.id === requestId && entry.res);
      if (!line) throw new Error(`no log line for request ${requestId}`);
      return line;
    });

  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [ProbeController],
      override: (builder) =>
        builder.overrideProvider(PARAMS_PROVIDER_TOKEN).useValue(loggerParams('info', sink)),
    });
  });

  afterAll(async () => {
    await t.close();
  });

  const http = () => t.http();

  it('masks the token header, URL secrets and secret fields of logged objects', async () => {
    const response = await http()
      .post('/v1/test-logs/echo?exp=1&sig=SIG-SECRET&token=TOKEN-SECRET')
      .set('Authorization', 'Bearer ACCESS-SECRET')
      .send({ email: 'a@example.com', password: 'PASS-SECRET', refreshToken: 'REFRESH-SECRET' })
      .expect(204);
    const line = await lineOf(response.headers['x-request-id']);

    expect(line.level).toBe(30);
    expect(line.req?.headers.authorization).toBe('[Redacted]');
    expect(line.req?.url).toBe('/v1/test-logs/echo?exp=1&sig=[Redacted]&token=[Redacted]');
    expect(line.req?.query).toMatchObject({ exp: '1', sig: '[Redacted]', token: '[Redacted]' });

    const bodyLine = parsed().find((entry) => entry.msg === 'got a body');
    expect(bodyLine?.body).toEqual({
      email: 'a@example.com',
      password: '[Redacted]',
      refreshToken: '[Redacted]',
    });

    const log = lines.join('\n');
    for (const secret of secrets) expect(log).not.toContain(secret);
  });

  it('logs a business error as a warning with its code and without a stack', async () => {
    const response = await http().get('/v1/test-logs/full').expect(409);
    const line = await lineOf(response.headers['x-request-id']);
    expect(line).toMatchObject({ level: 40, errorCode: 'UNICORE_FULL', res: { statusCode: 409 } });
    expect(line.err).toBeUndefined();
  });

  it('keeps the stack of an unknown error in the log only', async () => {
    const response = await http().get('/v1/test-logs/crash').expect(500);
    expect(response.text).not.toContain('database exploded');

    const line = await lineOf(response.headers['x-request-id']);
    expect(line).toMatchObject({
      level: 50,
      errorCode: 'UNICORE_INTERNAL',
      res: { statusCode: 500 },
      err: { message: 'database exploded' },
    });
    expect(line.err?.stack).toMatch(/database exploded\n\s+at /);
  });
});

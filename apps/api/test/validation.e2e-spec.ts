import { Body, Controller, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  idSchema,
  type SignUpRequest,
  signUpRequestSchema,
  type VerifyEmailQuery,
  verifyEmailQuerySchema,
} from '@unicore/shared';
import { createTestApp, type TestApp } from './app.js';

/** A route of the shape the real controllers get in stages 3–5, to check the global pipe. */
@Controller('test-probe')
class ProbeController {
  @Post(':id')
  @HttpCode(200)
  echo(
    @Param('id', { schema: idSchema }) id: string,
    @Query({ schema: verifyEmailQuerySchema.partial() }) query: Partial<VerifyEmailQuery>,
    @Body({ schema: signUpRequestSchema }) body: SignUpRequest,
  ) {
    return { id, query, body };
  }
}

const id = '6f1c2b3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
const valid = { email: 'student@example.com', password: 'password', name: 'Аня' };

describe('input validation', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await t.close();
  });

  const post = (path: string) => t.http().post(path);

  it('passes the parsed body to the handler', async () => {
    const response = await post(`/v1/test-probe/${id}?token=abc`)
      .send({ ...valid, email: ' Student@Example.COM ', name: '  Аня ', isAdmin: true })
      .expect(200);
    expect(response.body).toEqual({ id, query: { token: 'abc' }, body: valid });
  });

  it('answers 422 UNICORE_INVALID_INPUT with the path to the field', async () => {
    const response = await post(`/v1/test-probe/${id}`)
      .send({ ...valid, email: 'not-an-email' })
      .expect(422);
    expect(response.body).toEqual({
      error: { code: 'UNICORE_INVALID_INPUT', message: expect.stringMatching(/^email: /) },
    });
  });

  it('names nested fields and every failed one', async () => {
    const response = await post(`/v1/test-probe/${id}`)
      .send({ ...valid, name: '', partner: { company: ' ', code: 'abc' } })
      .expect(422);
    expect(response.body.error.message).toMatch(/^name: .+; partner\.company: /);
  });

  it('names the route parameter', async () => {
    const response = await post('/v1/test-probe/42').send(valid).expect(422);
    expect(response.body.error).toEqual({
      code: 'UNICORE_INVALID_INPUT',
      message: expect.stringMatching(/^id: /),
    });
  });

  it('rejects a request without a body', async () => {
    const response = await post(`/v1/test-probe/${id}`).expect(422);
    expect(response.body.error.code).toBe('UNICORE_INVALID_INPUT');
  });
});

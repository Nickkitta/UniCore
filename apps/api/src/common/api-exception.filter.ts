import { inspect } from 'node:util';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { type ApiErrorCode, errorBody, errorStatus } from '@unicore/shared';
import type { Response } from 'express';
import { DomainError } from './domain-error.js';

/** The only message of a 500: the details stay in the log. */
export const internalErrorMessage = 'Internal server error';

/**
 * Codes for the exceptions of Nest, Express and the Nest packages: `NotFoundException` of an
 * unknown route, 400 of malformed JSON, 413 of a body or file over the limit, 429 of
 * `ThrottlerException`, 403 of a guard that returned false.
 */
const codeByStatus: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'UNICORE_INVALID_INPUT',
  [HttpStatus.UNAUTHORIZED]: 'UNICORE_AUTH_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'UNICORE_FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'UNICORE_NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'UNICORE_FILE_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNICORE_INVALID_INPUT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'UNICORE_RATE_LIMIT',
};

/** The code and message the client gets for any thrown value. */
export function toApiError(exception: unknown): { code: ApiErrorCode; message: string } {
  if (exception instanceof DomainError) {
    return { code: exception.code, message: exception.message };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    // Another 4xx (e.g. 415 from body-parser) is a malformed request too.
    const code =
      codeByStatus[status] ?? (status < 500 ? 'UNICORE_INVALID_INPUT' : 'UNICORE_INTERNAL');
    if (code !== 'UNICORE_INTERNAL') return { code, message: exception.message };
  }
  return { code: 'UNICORE_INTERNAL', message: internalErrorMessage };
}

/**
 * Answers every error in the format of the contract, `{ error: { code, message } }`, with the
 * status from `errorStatus`. It also gets the errors thrown outside controllers: unknown routes
 * and the body parser. It replaces Nest's default handler, which logged unknown errors itself:
 * here such an error goes to `res.err`, and pino-http writes it with the stack into the line of
 * the request. `res.locals.errorCode` adds the code to that line (see logger.params.ts).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const { code, message } = toApiError(exception);
    if (code === 'UNICORE_INTERNAL') {
      response.err =
        exception instanceof Error
          ? exception
          : new Error(`Non-error thrown: ${inspect(exception)}`);
    }
    response.locals.errorCode = code;
    this.adapterHost.httpAdapter.reply(response, errorBody(code, message), errorStatus[code]);
  }
}

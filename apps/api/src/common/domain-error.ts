import { type ApiErrorCode, errorMessages } from '@unicore/shared';

/**
 * A broken business rule with its `UNICORE_*` code. Services, CLI commands and the seeder throw
 * it instead of an `HttpException`: they don't know about HTTP, and `ApiExceptionFilter` turns
 * the code into the status from `errorStatus`. The message is for debugging; by default it is
 * the text the client shows for the code.
 */
export class DomainError extends Error {
  override readonly name = 'DomainError';
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string = errorMessages[code]) {
    super(message);
    this.code = code;
  }
}

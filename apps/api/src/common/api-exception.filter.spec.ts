import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { errorMessages } from '@unicore/shared';
import { internalErrorMessage, toApiError } from './api-exception.filter.js';
import { DomainError } from './domain-error.js';

describe('toApiError', () => {
  it('keeps the code and message of a DomainError', () => {
    expect(toApiError(new DomainError('UNICORE_FULL', 'activity 42 is full'))).toEqual({
      code: 'UNICORE_FULL',
      message: 'activity 42 is full',
    });
  });

  it('defaults the message of a DomainError to the text of its code', () => {
    expect(new DomainError('UNICORE_PAST').message).toBe(errorMessages.UNICORE_PAST);
  });

  it.each([
    [new BadRequestException('Unexpected token'), 'UNICORE_INVALID_INPUT'],
    [new UnauthorizedException(), 'UNICORE_AUTH_REQUIRED'],
    [new ForbiddenException(), 'UNICORE_FORBIDDEN'],
    [new NotFoundException('Cannot GET /v1/nope'), 'UNICORE_NOT_FOUND'],
    [new PayloadTooLargeException(), 'UNICORE_FILE_TOO_LARGE'],
    [new HttpException('request entity too large', 413), 'UNICORE_FILE_TOO_LARGE'],
    [new UnprocessableEntityException(), 'UNICORE_INVALID_INPUT'],
    [new HttpException('ThrottlerException: Too Many Requests', 429), 'UNICORE_RATE_LIMIT'],
    [new HttpException('unsupported charset', 415), 'UNICORE_INVALID_INPUT'],
  ])('maps %s to %s with its message', (exception, code) => {
    expect(toApiError(exception)).toEqual({ code, message: exception.message });
  });

  it.each([
    ['a 5xx HttpException', new ServiceUnavailableException('pool exhausted at db.ts:12')],
    ['an Error', new Error('relation "users" does not exist')],
    ['a thrown string', 'secret detail'],
    ['undefined', undefined],
  ])('hides the details of %s behind UNICORE_INTERNAL', (_name, exception) => {
    expect(toApiError(exception)).toEqual({
      code: 'UNICORE_INTERNAL',
      message: internalErrorMessage,
    });
  });
});

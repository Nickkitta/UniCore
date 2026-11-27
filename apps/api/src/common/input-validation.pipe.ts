import {
  type ArgumentMetadata,
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
  UnprocessableEntityException,
} from '@nestjs/common';
import { errorBody } from '@unicore/shared';

type Issues = Parameters<NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>>[0];

/** Carries the issues from `exceptionFactory`, which doesn't see the parameter, to `transform`. */
class InvalidInput extends Error {
  readonly issues: Issues;

  constructor(issues: Issues) {
    super('Invalid input');
    this.issues = issues;
  }
}

/**
 * Checks `@Body({ schema })`, `@Query({ schema })` and `@Param('id', { schema })` with the
 * schemas from @unicore/shared. A failed check is 422 UNICORE_INVALID_INPUT, and the message
 * names each field, e.g. `partner.company: Too small…` or `id: Invalid UUID`.
 * The handler gets the parsed value: trimmed strings, defaults, unknown fields dropped.
 */
export class InputValidationPipe extends StandardSchemaValidationPipe {
  constructor() {
    super({ exceptionFactory: (issues) => new InvalidInput(issues) });
  }

  override async transform<T = unknown>(value: T, metadata: ArgumentMetadata): Promise<T> {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (!(error instanceof InvalidInput)) throw error;
      throw new UnprocessableEntityException(
        errorBody('UNICORE_INVALID_INPUT', describeIssues(error.issues, metadata.data)),
      );
    }
  }
}

/** `path: message` for each issue; `field` is the name in `@Param('id')` or `@Query('token')`. */
export function describeIssues(issues: Issues, field?: string) {
  return issues
    .map((issue) => {
      const segments = (issue.path ?? []).map((segment) =>
        String(typeof segment === 'object' ? segment.key : segment),
      );
      const path = [...(field ? [field] : []), ...segments].join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

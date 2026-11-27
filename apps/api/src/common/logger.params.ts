import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { DestinationStream, LevelWithSilent } from 'pino';
import type { Options } from 'pino-http';

const redacted = '[Redacted]';

/**
 * Hides the values of the `sig` (photo links, stage 5) and `token` (email confirmation, 3.4)
 * query parameters: both work as passwords for as long as the link lives.
 */
export function maskUrlSecrets(url: string) {
  return url.replace(/([?&](?:sig|token)=)[^&#]*/gi, `$1${redacted}`);
}

/** Set by ApiExceptionFilter on an error response. */
type ResponseWithCode = ServerResponse & { locals?: { errorCode?: string } };

/**
 * Options of the HTTP log: a JSON line per request with a UUID (also sent as `X-Request-Id`),
 * the level by status, the error code, and secrets masked. Request bodies are not logged; the
 * redaction paths for `password`, `refreshToken` and `token` guard against a logged object.
 * `destination` is stdout by default; the logging test passes a stream to read the lines.
 */
export function loggerParams(level: LevelWithSilent, destination?: DestinationStream): Params {
  const options: Options = {
    level,
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      return res.statusCode >= 400 ? 'warn' : 'info';
    },
    // Called again when the response is finished, after the exception filter set the code.
    customProps: (_req, res) => {
      const errorCode = (res as ResponseWithCode).locals?.errorCode;
      return errorCode ? { errorCode } : {};
    },
    serializers: {
      // Gets the result of the standard serializer: `url` is the original one, with the query.
      req: (req: { url?: string }) => {
        if (typeof req.url === 'string') req.url = maskUrlSecrets(req.url);
        return req;
      },
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.query.sig',
        'req.query.token',
        'password',
        'refreshToken',
        'token',
        '*.password',
        '*.refreshToken',
        '*.token',
      ],
      censor: redacted,
    },
  };
  return { pinoHttp: destination ? [options, destination] : options };
}

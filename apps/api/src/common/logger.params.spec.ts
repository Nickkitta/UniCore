import { maskUrlSecrets } from './logger.params.js';

describe('maskUrlSecrets', () => {
  it('masks the signature of a photo link', () => {
    expect(maskUrlSecrets('/v1/files/42?exp=1764240000&sig=abc123')).toBe(
      '/v1/files/42?exp=1764240000&sig=[Redacted]',
    );
  });

  it('masks the email confirmation token', () => {
    expect(maskUrlSecrets('/v1/auth/verify?token=abc123')).toBe('/v1/auth/verify?token=[Redacted]');
  });

  it('masks every secret parameter and keeps the rest', () => {
    expect(maskUrlSecrets('/v1/x?sig=a&page=2&TOKEN=b#top')).toBe(
      '/v1/x?sig=[Redacted]&page=2&TOKEN=[Redacted]#top',
    );
  });

  it('leaves parameters that only end with the name alone', () => {
    expect(maskUrlSecrets('/v1/x?mysig=a&refresh_token=b')).toBe('/v1/x?mysig=a&refresh_token=b');
  });

  it('leaves a URL without a query alone', () => {
    expect(maskUrlSecrets('/v1/health')).toBe('/v1/health');
  });
});

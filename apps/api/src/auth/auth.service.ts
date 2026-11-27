import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SignInRequest, SignUpRequest, SignUpResponse, Tokens } from '@unicore/shared';
import { DomainError } from '../common/domain-error.js';
import type { Env } from '../config/env.js';
import { EmailVerificationService } from './email-verification.service.js';
import { TokensService } from './tokens.service.js';
import { UsersService } from './users.service.js';

/** Sign-up and sign-in: an account and a session, one method per route of AuthController. */
@Injectable()
export class AuthService {
  private readonly requireVerifiedEmail: boolean;

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokensService,
    private readonly verification: EmailVerificationService,
    config: ConfigService<Env, true>,
  ) {
    this.requireVerifiedEmail = config.get('AUTH_REQUIRE_EMAIL_VERIFICATION', { infer: true });
  }

  /**
   * A student account. With AUTH_REQUIRE_EMAIL_VERIFICATION it gets a confirmation email and
   * no session yet; otherwise a session right away.
   */
  async signUp(request: SignUpRequest): Promise<SignUpResponse> {
    // Partner codes come with task 3.5. Until then no code is valid, and a partner must not
    // silently become a student: the same answer an unknown code will get.
    if (request.partner) throw new DomainError('UNICORE_INVALID_CODE');
    const account = { email: request.email, password: request.password, name: request.name };

    if (!this.requireVerifiedEmail) {
      const { id } = await this.users.create(account);
      return this.tokens.issue(id);
    }

    let token = '';
    // The link is stored with the account: no account without a link, no link without an account.
    const user = await this.users.create(account, async (tx, userId) => {
      token = await this.verification.issue(tx, userId);
    });
    this.verification.sendLink(user, token);
    return { verificationRequired: true };
  }

  /**
   * A new session once the password, the portal and, when required, the confirmed email
   * check out; in that order, so that each answer reveals no more than the previous one.
   */
  async signIn(request: SignInRequest): Promise<Tokens> {
    const user = await this.users.authenticate(request);
    if (this.requireVerifiedEmail && !user.emailVerified) {
      throw new DomainError('UNICORE_EMAIL_NOT_CONFIRMED');
    }
    return this.tokens.issue(user.id);
  }
}

import { Injectable } from '@nestjs/common';
import type { SignInRequest, SignUpRequest, SignUpResponse, Tokens } from '@unicore/shared';
import { DomainError } from '../common/domain-error.js';
import { TokensService } from './tokens.service.js';
import { UsersService } from './users.service.js';

/** Sign-up and sign-in: an account and a session, one method per route of AuthController. */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokensService,
  ) {}

  /** A student account and a new session. */
  async signUp(request: SignUpRequest): Promise<SignUpResponse> {
    // Partner codes come with task 3.5. Until then no code is valid, and a partner must not
    // silently become a student: the same answer an unknown code will get.
    if (request.partner) throw new DomainError('UNICORE_INVALID_CODE');
    const { id } = await this.users.create({
      email: request.email,
      password: request.password,
      name: request.name,
    });
    return this.tokens.issue(id);
  }

  /** A new session once the password and the portal match the account. */
  async signIn(request: SignInRequest): Promise<Tokens> {
    const userId = await this.users.authenticate(request);
    return this.tokens.issue(userId);
  }
}

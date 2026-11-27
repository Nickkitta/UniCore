import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type RefreshTokenRequest,
  refreshTokenRequestSchema,
  type SignInRequest,
  signInRequestSchema,
  type SignUpRequest,
  type SignUpResponse,
  signUpRequestSchema,
  type Tokens,
} from '@unicore/shared';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';

/**
 * /v1/auth/*. Sign-up answers 201 (an account is created), sign-in and refresh 200,
 * sign-out 204. The routes stay open when the global AuthGuard arrives (task 3.8).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
  ) {}

  @Post('sign-up')
  signUp(@Body({ schema: signUpRequestSchema }) body: SignUpRequest): Promise<SignUpResponse> {
    return this.auth.signUp(body);
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  signIn(@Body({ schema: signInRequestSchema }) body: SignInRequest): Promise<Tokens> {
    return this.auth.signIn(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body({ schema: refreshTokenRequestSchema }) body: RefreshTokenRequest): Promise<Tokens> {
    return this.tokens.refresh(body.refreshToken);
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(@Body({ schema: refreshTokenRequestSchema }) body: RefreshTokenRequest): Promise<void> {
    return this.tokens.revoke(body.refreshToken);
  }
}

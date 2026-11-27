import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from '@nestjs/common';
import {
  type RefreshTokenRequest,
  refreshTokenRequestSchema,
  type ResendVerificationRequest,
  resendVerificationRequestSchema,
  type SignInRequest,
  signInRequestSchema,
  type SignUpRequest,
  type SignUpResponse,
  signUpRequestSchema,
  type Tokens,
  type VerifyEmailQuery,
  verifyEmailQuerySchema,
} from '@unicore/shared';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { TokensService } from './tokens.service.js';
import { verifyPage } from './verify-page.js';

/**
 * /v1/auth/*. Sign-up answers 201 (an account is created), sign-in and refresh 200,
 * sign-out and resend-verification 204; verify answers a browser with an HTML page.
 * The routes stay open when the global AuthGuard arrives (task 3.8).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly verification: EmailVerificationService,
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

  /** The same 204 whether the account exists or not, and whether an email went out. */
  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  resendVerification(
    @Body({ schema: resendVerificationRequestSchema }) body: ResendVerificationRequest,
  ): Promise<void> {
    return this.verification.resend(body.email);
  }

  /**
   * The link from the email, opened in a browser. Headers are set here, not with @Header:
   * those are applied before the pipes run, so a 422 from the query schema would go out as
   * JSON labelled text/html.
   */
  @Get('verify')
  async verify(
    @Query({ schema: verifyEmailQuerySchema }) query: VerifyEmailQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const page = verifyPage(await this.verification.verify(query.token));
    response.status(page.status).set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // The address holds the token: it must not leak to another site.
      'Referrer-Policy': 'no-referrer',
    });
    return page.html;
  }
}

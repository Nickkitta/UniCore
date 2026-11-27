import { z } from 'zod';
import { accountKinds } from '../models.ts';
import { emailSchema, textSchema } from './common.ts';

// /v1/auth/*. The password length is checked by the server (UNICORE_WEAK_PASSWORD), not here.

/** POST /v1/auth/sign-in. The portal is checked against the account: UNICORE_WRONG_PORTAL. */
export const signInRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  portal: z.enum(accountKinds),
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

/** POST /v1/auth/sign-up; `partner` registers a company with a code from an administrator. */
export const signUpRequestSchema = z.object({
  email: emailSchema,
  password: z.string(),
  name: textSchema(1, 40),
  partner: z.object({ company: textSchema(1, 80), code: textSchema(1, 200) }).optional(),
});
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

/** A new session: sign-in, sign-up without email verification, refresh. */
export const tokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Lifetime of the access token in seconds. */
  expiresIn: z.number(),
});
export type Tokens = z.infer<typeof tokensSchema>;

/** Sign-up answers with tokens, or asks to confirm the email first. */
export const signUpResponseSchema = z.union([
  tokensSchema,
  z.object({ verificationRequired: z.literal(true) }),
]);
export type SignUpResponse = z.infer<typeof signUpResponseSchema>;

/** POST /v1/auth/refresh and POST /v1/auth/sign-out. */
export const refreshTokenRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

/** POST /v1/auth/resend-verification; the answer never tells whether the account exists. */
export const resendVerificationRequestSchema = z.object({ email: emailSchema });
export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

/** GET /v1/auth/verify?token=… — the link from the email. */
export const verifyEmailQuerySchema = z.object({ token: z.string().min(1) });
export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;

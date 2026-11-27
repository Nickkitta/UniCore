import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';
import { UsersService } from './users.service.js';

/** Accounts, passwords, sessions and the /v1/auth/* routes. */
@Module({
  controllers: [AuthController],
  providers: [UsersService, TokensService, AuthService],
  exports: [UsersService, TokensService],
})
export class AuthModule {}

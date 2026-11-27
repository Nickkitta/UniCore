import { Module } from '@nestjs/common';
import { TokensService } from './tokens.service.js';
import { UsersService } from './users.service.js';

/** Accounts, passwords, tokens and, from the next tasks, the /v1/auth/* routes. */
@Module({
  providers: [UsersService, TokensService],
  exports: [UsersService, TokensService],
})
export class AuthModule {}

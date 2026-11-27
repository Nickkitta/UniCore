import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';

/** Accounts, passwords and, from the next tasks, tokens and the /v1/auth/* routes. */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class AuthModule {}

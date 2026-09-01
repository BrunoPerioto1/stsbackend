import { Module } from '@nestjs/common';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { UsersRepository } from '../infra/repository/users.repository';
import { DatabaseModule } from '../infra/db/db.module';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infra/db/db.module';
import { AdminController } from '../admin/admin.controller';
import { AdminService } from '../admin/admin.service';
import { AdminRepository } from '../infra/repository/admin.repository';
import { UsersModule } from './users.module';

@Module({
  // UsersModule pelo UsersRepository: mudar papel/desbloquear/desvincular é
  // UPDATE em `users`, que ele já sabe fazer. O AdminRepository só lê.
  imports: [DatabaseModule, UsersModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}

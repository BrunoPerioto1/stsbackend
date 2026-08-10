import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtStrategy } from "../auth/jwt/jwt.strategy";
import { AuthService } from "../auth/AuthService";
import { AuthController } from "../auth/auth.controller";
import { UsersModule } from "../users/users.module";
import * as dotenv from 'dotenv';

dotenv.config();


@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { algorithm: "HS256", expiresIn: "1d" },
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService],
  exports: [JwtStrategy, JwtModule, AuthService],
})
export class AuthModule {}

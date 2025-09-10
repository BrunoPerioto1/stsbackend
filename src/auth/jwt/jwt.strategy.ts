import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import * as dotenv from 'dotenv';

dotenv.config();



@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined in environment variables");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
      algorithms: ["HS256"],
    });
  }

  async validate(payload: any) {
    const currentTimestamp = Date.now() / 1000;
    if (payload.exp < currentTimestamp) {
      throw new UnauthorizedException("TokenExpiredError");
    }
    return payload;
  }
}

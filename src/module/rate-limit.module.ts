import { Module } from '@nestjs/common';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';

// O banco vem do DatabaseModule, que é global.
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}

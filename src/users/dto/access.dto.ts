import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// payToken vem no corpo da resposta 402 (ver users/access.ts).
export class BillingQueryDTO {
  @ApiProperty({ required: false, description: 'payToken da resposta 402' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string;
}

export class PaymentClaimDTO {
  @ApiProperty({ description: 'payToken da resposta 402' })
  @IsString()
  @MaxLength(200)
  token!: string;
}

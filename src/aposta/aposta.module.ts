import { Module } from '@nestjs/common';
import { ApostaService } from './aposta.service';
 import { ApostaController } from './aposta.controller';


@Module({
  providers: [ApostaService],
   controllers: [ApostaController],
  exports: [ApostaService],
})
export class ApostaModule {}

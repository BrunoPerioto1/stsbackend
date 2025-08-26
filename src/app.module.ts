import { Module } from '@nestjs/common';
//import { AppController } from './app.controller';
//import { AppService } from './app.service';
import { ApostaModule } from './aposta/aposta.module';
import { TelegramModule } from './telegram/telegram.module';
import { CasaModule } from './casa/casa.module';

@Module({
  imports: [ApostaModule, TelegramModule, CasaModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
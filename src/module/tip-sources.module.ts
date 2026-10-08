import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infra/db/db.module';
import { TipSourcesRepository } from '../infra/repository/tip-sources.repository';
import { TipSourcesService } from '../tip-sources/tip-sources.service';

// Sem controller próprio: as rotas moram onde quem chama já está — o cadastro
// no AdminController (/admin/sources), o liga/desliga do usuário no
// TipsController (/tips/sources) — e o fan-out usa a tradução.
@Module({
  imports: [DatabaseModule],
  providers: [TipSourcesRepository, TipSourcesService],
  exports: [TipSourcesService],
})
export class TipSourcesModule {}

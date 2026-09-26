import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { errorArgs } from './common/utils/log';
import { allowedOrigins } from './common/utils/cors';

// Bootstrap do Nest isolado do app.listen() — reaproveitado tanto pelo
// main.ts (dev local) quanto pela function serverless da Vercel
// (api/index.ts), que não escuta uma porta, só delega req/res pro Express
// interno do Nest.
export async function createNestApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Só o front chama pelo navegador (ver allowedOrigins). Webhook do Telegram,
  // cron e job não mandam Origin e não passam por CORS.
  // maxAge cacheia o preflight: sem isso cada request do front paga um OPTIONS extra.
  app.enableCors({ origin: allowedOrigins(), maxAge: 86400 });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const isDev = process.env.NODE_ENV !== 'production';
  // Import dinâmico: @scalar/nestjs-api-reference quebra o boot inteiro em
  // produção (ERR_REQUIRE_ESM, seu .cjs faz require() de uma dependência ESM-only)
  // — um `import` estático no topo do arquivo já dispara isso antes mesmo do
  // `if (isDev)` rodar, então isolamos o require só pro caminho de dev.
  if (isDev) {
    try {
      const { configureSwagger } = await import('./swagger');
      configureSwagger(app);
    } catch (err) {
      new Logger('Bootstrap').error(...errorArgs('Falha ao carregar a documentação Swagger/Scalar', err));
    }
  }

  return app;
}

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

// Bootstrap do Nest isolado do app.listen() — reaproveitado tanto pelo
// main.ts (dev local) quanto pela function serverless da Vercel
// (api/index.ts), que não escuta uma porta, só delega req/res pro Express
// interno do Nest.
export async function createNestApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();

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
      console.error(
        '⚠️  Falha ao carregar a documentação Swagger/Scalar:',
        err,
      );
    }
  }

  return app;
}

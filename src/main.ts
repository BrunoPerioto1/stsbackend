import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
      console.error('⚠️  Falha ao carregar a documentação Swagger/Scalar:', err);
    }
  }

  await app.listen(4000);
  console.log('🚀 Application is running on: http://localhost:4000');
  if (isDev) console.log('📚 Swagger documentation available at: http://localhost:4000/doc');
}
bootstrap();

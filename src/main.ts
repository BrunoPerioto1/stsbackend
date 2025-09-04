import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // AQUI É ONDE VOCÊ MEXE.
  // -------------------------------------------------------------
  // Opção 1 (Recomendada): Permite requisições de uma origem específica
  // Substitua 'https://SEU-FRONTEND.vercel.app' pela URL do seu front-end.
  app.enableCors({
    origin: 'https://sts-liart-alpha.vercel.app', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  
  // Opção 2 (Temporária, para testes): Permite requisições de qualquer origem
  // Essa abordagem é menos segura, mas resolve rapidamente o problema de CORS.
  // app.enableCors();
  // -------------------------------------------------------------

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuração do Swagger
  const config = new DocumentBuilder()
    .setTitle('Bot Telegram - API de Apostas')
    .setDescription('API para gerenciamento de apostas e casas de apostas')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app as any, config);
  SwaggerModule.setup('api', app as any, document);

  await app.listen(4000);
  console.log('🚀 Application is running on: http://localhost:4000');
  console.log('📚 Swagger documentation available at: http://localhost:4000/api');
}
bootstrap();

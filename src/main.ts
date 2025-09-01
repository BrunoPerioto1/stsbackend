import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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

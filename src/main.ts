import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { configureSwagger } from './swagger';

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
  if (isDev) configureSwagger(app);

  await app.listen(4000);
  console.log('🚀 Application is running on: http://localhost:4000');
  if (isDev) console.log('📚 Swagger documentation available at: http://localhost:4000/doc');
}
bootstrap();

import { Logger } from '@nestjs/common';
import { createNestApp } from './create-app';

async function bootstrap() {
  const app = await createNestApp();

  await app.listen(4000);
  const logger = new Logger('Bootstrap');
  logger.log('API rodando em http://localhost:4000');
  if (process.env.NODE_ENV !== 'production') {
    logger.log('Documentação Swagger em http://localhost:4000/doc');
  }
}
void bootstrap();

import { createNestApp } from './create-app';

async function bootstrap() {
  const app = await createNestApp();

  await app.listen(4000);
  console.log('🚀 Application is running on: http://localhost:4000');
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      '📚 Swagger documentation available at: http://localhost:4000/doc',
    );
  }
}
void bootstrap();

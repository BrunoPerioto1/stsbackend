import type { IncomingMessage, ServerResponse } from 'http';
// Importa do dist/ (já compilado pelo `nest build`, rodado como buildCommand
// antes desta function) em vez de src/ — assim os decorators do Nest passam
// pelo tsc de verdade (emitDecoratorMetadata), não pelo bundler da própria
// function serverless, que não suporta emissão de metadata de decorator.
import { createNestApp } from '../dist/create-app';

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

// Cacheado no escopo do módulo: sobrevive entre invocações no mesmo
// container (só recria o app do Nest em cold start, não a cada request).
let expressAppPromise: Promise<RequestHandler> | null = null;

function getExpressApp(): Promise<RequestHandler> {
  if (!expressAppPromise) {
    expressAppPromise = createNestApp().then(async (app) => {
      await app.init();
      return app.getHttpAdapter().getInstance() as RequestHandler;
    });
  }
  return expressAppPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const expressApp = await getExpressApp();
  expressApp(req, res);
}

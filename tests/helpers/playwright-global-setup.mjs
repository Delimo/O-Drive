import { closeStaticServer, createStaticServer } from './static-server.mjs';

export default async function globalSetup() {
  if (process.env.ODRIVE_BASE_URL) return undefined;
  const port = parseInt(process.env.PORT || '8788', 10);
  const server = await createStaticServer({ port });
  return async () => closeStaticServer(server);
}

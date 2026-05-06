import { createServer } from 'node:http';

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function startTestServer(app) {
  const server = createServer(app);

  await new Promise((resolve, reject) => {
    function cleanup() {
      server.off('listening', handleListening);
      server.off('error', handleError);
    }

    function handleListening() {
      cleanup();
      resolve();
    }

    function handleError(error) {
      cleanup();
      reject(error);
    }

    server.once('listening', handleListening);
    server.once('error', handleError);
    server.listen(0, '127.0.0.1');
  });

  const address = server.address();
  if (
    !address ||
    typeof address === 'string' ||
    !Number.isInteger(address.port) ||
    address.port <= 0
  ) {
    await closeServer(server).catch(() => {});
    throw new Error('Test server did not bind to a TCP port');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

export async function closeTestServer(server) {
  if (!server) return;
  await closeServer(server);
}

import http from 'node:http';

const port = Number(process.env.PORT ?? '0');

const server = http.createServer((_request, res) => {
  res.statusCode = 500;
  res.end('backend-not-ready');
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  console.error(`BACKEND_NOT_READY:${boundPort}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import {
  contentDisposition,
  generateEpub,
  InvalidEpubInputError,
  parseEpubRequest,
} from './server/epub.ts';
import { createRateLimiter } from './server/rate-limit.ts';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

function securityHeaders(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "worker-src 'self' blob:",
        "connect-src 'self' https://api.openai.com https://*.googleapis.com",
      ].join('; '),
    );
  }
  next();
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: '20mb', type: 'application/json' }));

  // API routes
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
  });

  app.post('/api/generate-epub', createRateLimiter(30, 60 * 60 * 1000), async (req, res) => {
    try {
      const input = parseEpubRequest(req.body);
      const epubBuffer = await generateEpub(input);

      res.setHeader('Content-Type', 'application/epub+zip');
      res.setHeader('Content-Disposition', contentDisposition(input.title));
      res.setHeader('Cache-Control', 'no-store');
      res.send(epubBuffer);
    } catch (error: unknown) {
      if (error instanceof InvalidEpubInputError) {
        return res.status(400).json({ error: error.message });
      }
      console.error('EPUB Generation Error:', error);
      res.status(500).json({ error: 'Unable to generate EPUB' });
    }
  });

  // Vite middleware for development
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      index: false,
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'index.html') res.setHeader('Cache-Control', 'no-cache');
      },
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON body' });
    if ((error as { type?: string })?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large' });
    }
    console.error('Unhandled request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 15_000;

  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((error) => {
  console.error('Unable to start server:', error);
  process.exitCode = 1;
});

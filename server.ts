import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import epubModule from 'epub-gen-memory';
const epub = (epubModule as any).default || epubModule;
import { marked } from 'marked';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '50mb' }));

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/generate-epub', async (req, res) => {
    try {
      const { title, markdown, author, cover } = req.body;
      if (!markdown) {
        return res.status(400).json({ error: 'Missing markdown content' });
      }

      const tokens = marked.lexer(markdown);
      const chapters: { title: string; raw: string }[] = [];
      let currentChapter = { title: '前言', raw: '' };

      for (const token of tokens) {
        if (token.type === 'heading' && (token.depth === 1 || token.depth === 2 || token.depth === 3)) {
          if (currentChapter.raw.trim()) {
            chapters.push(currentChapter);
          }
          currentChapter = { title: token.text, raw: token.raw };
        } else {
          currentChapter.raw += token.raw;
        }
      }
      if (currentChapter.raw.trim()) {
        chapters.push(currentChapter);
      }

      const epubChapters = await Promise.all(chapters.map(async (ch) => {
        let htmlContent = await marked.parse(ch.raw);
        
        // Remove all img, picture, and svg tags because epub-gen-memory fails with non-absolute/base64 URLs
        htmlContent = htmlContent.replace(/<img[^>]*>/g, '');
        htmlContent = htmlContent.replace(/<picture[^>]*>[\s\S]*?<\/picture>/gi, '');
        htmlContent = htmlContent.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');
        
        return {
          title: ch.title,
          content: htmlContent
        };
      }));

      if (epubChapters.length === 0) {
        epubChapters.push({ title: '內容', content: '<p>無內容</p>' });
      }

      const epubOptions: any = { 
        title: title || 'Translated Document', 
        author: author || 'AI Translator',
        date: new Date().toISOString().split('.')[0] + 'Z',
        lang: 'zh-TW',
        tocTitle: '目錄'
      };

      if (cover) {
        epubOptions.cover = cover;
      }

      const epubBuffer = await epub(
        epubOptions,
        epubChapters
      );

      res.setHeader('Content-Type', 'application/epub+zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title || 'document')}.epub"`);
      res.send(epubBuffer);
    } catch (error: any) {
      console.error('EPUB Generation Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

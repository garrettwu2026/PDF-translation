import epubModule from 'epub-gen-memory';
const epub = (epubModule as any).default || epubModule;
import { marked } from 'marked';

async function run() {
  const epubBuffer = await epub(
    { title: 'Test Document', author: 'AI Translator' },
    [{ title: 'Content', content: '<h1>Hello</h1><p>World</p>' }]
  );
  console.log('Buffer.isBuffer:', Buffer.isBuffer(epubBuffer));
  console.log('epubBuffer instanceof Uint8Array:', epubBuffer instanceof Uint8Array);
  console.log('epubBuffer constructor:', epubBuffer.constructor.name);
}
run().catch(console.error);

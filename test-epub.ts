import epubModule from 'epub-gen-memory';
const epub = (epubModule as any).default || epubModule;
import fs from 'fs';

async function run() {
  const epubBuffer = await epub(
    { title: 'Test Document', author: 'AI Translator' },
    [{ title: 'Content', content: '<h1>Hello</h1><p>World</p>' }]
  );
  fs.writeFileSync('test.epub', Buffer.from(epubBuffer));
  console.log('Saved test.epub, size:', epubBuffer.length);
}
run().catch(console.error);

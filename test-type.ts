import epubModule from 'epub-gen-memory';
const epub = (epubModule as any).default || epubModule;

async function run() {
  const epubBuffer = await epub(
    { title: 'Test Document', author: 'AI Translator' },
    [{ title: 'Content', content: '<h1>Hello</h1><p>World</p>' }]
  );
  console.log('Is Buffer?', Buffer.isBuffer(epubBuffer));
  console.log('Type:', typeof epubBuffer);
  console.log('Constructor:', epubBuffer.constructor.name);
}
run().catch(console.error);

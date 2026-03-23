import epubModule from 'epub-gen-memory';
const epub = (epubModule as any).default || epubModule;
import fs from 'fs';

async function run() {
  const epubBuffer = await epub(
    { title: '測試文件', author: 'AI Translator' },
    [{ title: '內容', content: '<h1>你好</h1><p>世界</p>' }]
  );
  fs.writeFileSync('test-zh.epub', Buffer.from(epubBuffer));
  console.log('Saved test-zh.epub, size:', epubBuffer.length);
}
run().catch(console.error);

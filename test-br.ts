import epubModule from 'epub-gen-memory';
const epub = (epubModule as any).default || epubModule;
import fs from 'fs';
import JSZip from 'jszip';

async function run() {
  const epubBuffer = await epub(
    { title: 'Test Document', author: 'AI Translator' },
    [{ title: 'Content', content: '<p>Line 1<br>Line 2</p><hr>' }]
  );
  fs.writeFileSync('test-br.epub', Buffer.from(epubBuffer));
  
  const buf = fs.readFileSync('test-br.epub');
  const zip = await JSZip.loadAsync(buf);
  const xhtml = await zip.file('OEBPS/0_Content.xhtml')?.async('string');
  console.log(xhtml);
}
run().catch(console.error);

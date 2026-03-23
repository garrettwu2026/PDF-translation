import fs from 'fs';
import JSZip from 'jszip';

async function run() {
  const buf = fs.readFileSync('test-large.epub');
  const zip = await JSZip.loadAsync(buf);
  const xhtml = await zip.file('OEBPS/0_Content.xhtml')?.async('string');
  console.log('XHTML length:', xhtml?.length);
}
run().catch(console.error);

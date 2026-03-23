import fs from 'fs';
import JSZip from 'jszip';

async function run() {
  const buf = fs.readFileSync('test-api.epub');
  const zip = await JSZip.loadAsync(buf);
  const xhtml = await zip.file('OEBPS/0_Content.xhtml')?.async('string');
  console.log(xhtml);
}
run().catch(console.error);

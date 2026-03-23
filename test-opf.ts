import fs from 'fs';
import JSZip from 'jszip';

async function run() {
  const buf = fs.readFileSync('test-api.epub');
  const zip = await JSZip.loadAsync(buf);
  const opf = await zip.file('OEBPS/content.opf')?.async('string');
  console.log(opf);
}
run().catch(console.error);

import fs from 'fs';
import JSZip from 'jszip';

async function run() {
  const buf = fs.readFileSync('test-zh.epub');
  const zip = await JSZip.loadAsync(buf);
  const ncx = await zip.file('OEBPS/toc.ncx')?.async('string');
  console.log(ncx);
}
run().catch(console.error);

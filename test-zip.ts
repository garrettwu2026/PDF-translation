import fs from 'fs';
import JSZip from 'jszip';

async function run() {
  const buf = fs.readFileSync('test.epub');
  const zip = await JSZip.loadAsync(buf);
  console.log('Files in zip:');
  Object.keys(zip.files).forEach(f => console.log(f));
}
run().catch(console.error);

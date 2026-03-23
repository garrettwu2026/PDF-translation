import fs from 'fs';
const buf = fs.readFileSync('test-zh.epub');
const zipStart = buf.indexOf(Buffer.from('mimetype'));
const mimetypeData = buf.slice(zipStart + 8, zipStart + 8 + 20);
console.log(mimetypeData.toString());

import fs from 'fs';

const buf = fs.readFileSync('test-api.epub');
// ZIP local file header signature is 0x04034b50
const sig = buf.readUInt32LE(0);
if (sig !== 0x04034b50) {
  console.log('Not a zip file');
} else {
  const filenameLen = buf.readUInt16LE(26);
  const extraFieldLen = buf.readUInt16LE(28);
  const filename = buf.toString('utf8', 30, 30 + filenameLen);
  console.log('First file:', filename);
  
  const compressionMethod = buf.readUInt16LE(8);
  console.log('Compression method:', compressionMethod, compressionMethod === 0 ? '(STORE)' : '(COMPRESSED)');
}

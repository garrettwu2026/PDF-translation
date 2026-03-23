import fs from 'fs';

const buf = fs.readFileSync('test-api.epub');
console.log('First 50 bytes:');
console.log(buf.slice(0, 50).toString('hex'));

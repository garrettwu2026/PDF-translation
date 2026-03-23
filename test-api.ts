import fs from 'fs';

async function run() {
  const response = await fetch('http://localhost:3000/api/generate-epub', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Test',
      markdown: '# Hello\nThis is a test.'
    })
  });
  
  console.log('Status:', response.status);
  console.log('Content-Type:', response.headers.get('content-type'));
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log('Size:', buffer.length);
  fs.writeFileSync('test-api.epub', buffer);
}
run().catch(console.error);

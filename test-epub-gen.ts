import epubModule from 'epub-gen-memory';
const epub = (epubModule as any).default || epubModule;
console.log(epub.toString());

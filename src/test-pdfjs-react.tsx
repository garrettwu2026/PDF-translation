import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

function Test() {
  const [text, setText] = useState('');
  
  const handleFile = async (e: any) => {
    const file = e.target.files[0];
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    setText(textContent.items.map((item: any) => item.str).join(' '));
  };
  
  return (
    <div>
      <input type="file" onChange={handleFile} />
      <div>{text}</div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Test />);

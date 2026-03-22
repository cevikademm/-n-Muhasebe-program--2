import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function run() {
  const data = new Uint8Array(fs.readFileSync('banka ekstresi/1 ay.pdf'));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  
  for (let i = 1; i <= Math.min(2, pdf.numPages); i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    const items = textContent.items;
    
    const groupedLines = {};
    for (const item of items) {
       const y = Math.round(item.transform[5] / 3) * 3;
       if (!groupedLines[y]) groupedLines[y] = [];
       groupedLines[y].push(item);
    }

    const sortedY = Object.keys(groupedLines).map(Number).sort((a, b) => b - a);
    const linesArr = [];
    for (const y of sortedY) {
       const lineItems = groupedLines[y].sort((a, b) => a.transform[4] - b.transform[4]);
       const lineStr = lineItems.map(i => i.str).join(" ").replace(/\s+/g, ' ').trim();
       if (lineStr) {
           linesArr.push(lineStr);
       }
    }
    
    console.log(`--- PAGE ${i} ---`);
    for(let j=0; j<15; j++) {
       console.log(linesArr[j]);
    }
    console.log("...");
    
    // Check regex
    for(const line of linesArr) {
      const match = line.match(/^(\d{2}\.\d{2})\s+(\w{2})\s+(.+?)(?:\s+([\d.]+,\d{2}))(?:\s+([\d.]+,\d{2}))?$/);
      if (match) {
        console.log("MATCHED:", line);
      }
    }
  }
}
run().catch(console.error);

import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';

async function extractText() {
    const dirPath = path.join(process.cwd(), 'datev 3 - Kopya');
    const outFile = path.join(process.cwd(), 'ocr_results.txt');

    if (fs.existsSync(outFile)) {
        fs.unlinkSync(outFile);
    }

    const worker = await createWorker('deu');
    console.log("Worker created and loaded deu");

    for (let i = 1; i <= 37; i++) {
        const imgPath = path.join(dirPath, `${i}.jpeg`);
        if (fs.existsSync(imgPath)) {
            console.log(`Extracting ${i}.jpeg...`);
            const { data: { text } } = await worker.recognize(imgPath);
            fs.appendFileSync(outFile, `--- FILE: ${i}.jpeg ---\n`);
            fs.appendFileSync(outFile, text + '\n\n');
        }
    }

    await worker.terminate();
    console.log("Extraction complete.");
}

extractText().catch(console.error);

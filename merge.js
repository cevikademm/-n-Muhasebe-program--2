import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

async function mergeJpegsToPdf() {
    const dirPath = 'c:\\Users\\cevikhann\\Desktop\\fibu.de-2\\datev 3 - Kopya';
    const outPath = 'c:\\Users\\cevikhann\\Desktop\\fibu.de-2\\datev 3 - Kopya\\merged_images.pdf';

    const pdfDoc = await PDFDocument.create();

    // We have 1 to 37 jpegs
    for (let i = 1; i <= 37; i++) {
        const imgPath = path.join(dirPath, `${i}.jpeg`);
        if (fs.existsSync(imgPath)) {
            console.log(`Processing ${i}.jpeg...`);
            const imgBytes = fs.readFileSync(imgPath);
            const image = await pdfDoc.embedJpg(imgBytes);

            const { width, height } = image.scale(1);
            const page = pdfDoc.addPage([width, height]);

            page.drawImage(image, {
                x: 0,
                y: 0,
                width,
                height,
            });
        } else {
            console.log(`Skipped ${i}.jpeg`);
        }
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outPath, pdfBytes);
    console.log(`Successfully created ${outPath}`);
}

mergeJpegsToPdf().catch(console.error);

import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Replace with dynamic load to avoid ts-node
async function generate() {
    try {
        // Read the skr03Metadata and extract what we need
        // Since it's TS, we can just compile it to a JS object using a quick regex or import the compiled dist if it exists, or just read the raw file.
        const fileContent = fs.readFileSync('data/skr03Metadata.ts', 'utf-8');
        
        // Find everything between `export const ACCOUNT_METADATA: Record<string, SKR03AccountMetadata> = {` and `};`
        let metadataString = fileContent.substring(fileContent.indexOf('export const ACCOUNT_METADATA'));
        // We'll just append this massive string directly to the prompt as a schema reference to avoid parsing overhead.
        
        const originalPrompt = fs.readFileSync('supabase/functions/super-worker/prompt.ts', 'utf-8');
        
        // Remove old appended metadata if it exists
        const splitTag = "\n\n--- DİKKAT: AŞAĞIDAKİ VERİ HESAP PLANININ KENDİSİDİR (ACCOUNT_METADATA) ---\n\n";
        const parts = originalPrompt.split(splitTag);
        let basePrompt = parts[0];

        // If the originalPrompt didn't have the tag yet, it might have the closing `;\n at the end. We need to strip it.
        if (parts.length === 1) {
            basePrompt = basePrompt.replace(/`\s*;\s*$/, "");
        } else {
             // If we already split, basePrompt is fine as long as we put the closing backtick back at the very end
        }

        const updatedPromptText = basePrompt + splitTag + 
            "Buradaki bilgileri eşleştirmek ve gerekçelendirmek (match_justification) için kullan, hiçbir hesabı dışarıdan uydurma. HesapPlanlari2Panel.tsx ile %100 birebir olacak:\n\n" +
            "--- TABLO BASLANGICI ---\n" + metadataString + "\n--- TABLO BITISI ---\n`;\n";

        fs.writeFileSync('supabase/functions/super-worker/prompt.ts', updatedPromptText);
        console.log("Successfully appended complete ACCOUNT_METADATA to super-worker prompt.ts");

    } catch(err) {
        console.error(err);
    }
}

generate();

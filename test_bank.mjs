import fs from 'fs';

// `jsonrepair` is not available by default in Node via import without npm install, 
// so we'll install it or just use the raw text for diagnosis.
// I will output the raw text to a file so we can see what's wrong.

async function main() {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not found in .env");
    }

    const pdfPath = './banka ekstresi/1 ay.pdf';
    console.log(`Reading ${pdfPath}...`);
    const pdfBuffer = fs.readFileSync(pdfPath);
    const fileBase64 = pdfBuffer.toString('base64');
    
    console.log("Reading system prompt...");
    let promptContent = fs.readFileSync('./supabase/functions/super-worker/prompt.ts', 'utf-8');
    const systemPrompt = promptContent.split('export const SYSTEM_PROMPT = `')[1].split('`;')[0];

    console.log("Calling Gemini 2.0 Flash API...");
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: systemPrompt },
                    {
                        inline_data: {
                            mime_type: "application/pdf",
                            data: fileBase64,
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                responseMimeType: "application/json"
            }
        })
    });

    if (!res.ok) {
        const txt = await res.text();
        console.error("API Fetch Error:", txt);
        return;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    console.log(`Writing raw output (${rawText.length} characters) to debug_raw.json...`);
    fs.writeFileSync('debug_raw.json', rawText, 'utf-8');

    // Try parsing
    try {
        let cleaned = rawText.replace(/```[a-zA-Z]*[-]?\n?/g, "").replace(/```\n?/g, "").trim();
        const obj = JSON.parse(cleaned);
        console.log("✅ JSON Successfully Parsed!");
        fs.writeFileSync('debug_parsed.json', JSON.stringify(obj, null, 2));
    } catch (e) {
        console.error("❌ JSON Parse Error:", e.message);
        console.error("A repair library would be needed. Please check debug_raw.json for the faulty syntax.");
    }
}

main().catch(console.error);

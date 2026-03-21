import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://edlbvezskqbxasqkszvd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkbGJ2ZXpza3FieGFzcWtzenZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNTcxNjMsImV4cCI6MjA4NjYzMzE2M30.DhdqRQxJZebjnOLg82pwN51rPw5koTgjwNwE8T0t4I0';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Invoking super-worker...");
  // Dummy 1x1 png pixel in base64
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  
  try {
    const { data, error } = await supabase.functions.invoke("super-worker", {
      body: { fileBase64: base64, fileType: "image/png", learningRules: [] },
    });
    
    console.log("Data:", data);
    if (error) {
        console.error("Supabase Invoke Error:", error);
    }
  } catch (err) {
    console.error("Catch Exception:", err);
  }
}

test();

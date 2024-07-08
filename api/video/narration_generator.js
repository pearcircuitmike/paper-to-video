import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";

dotenv.config();

async function generateAudio(script) {
  const voice_id = "9N8nIBnvZ0Hbs6qhIqpt";
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: script,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    }),
  };

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
    options
  );
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `ElevenLabs API error: ${response.status} ${response.statusText} - ${errorData}`
    );
  }

  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    throw new Error("Received empty audio buffer from ElevenLabs API");
  }

  return Buffer.from(audioBuffer);
}

async function main() {
  try {
    const outputDir = path.join(process.cwd(), "output");
    const scriptPath = path.join(outputDir, "script.txt");
    const script = await fs.readFile(scriptPath, "utf-8");

    const audioBuffer = await generateAudio(script);

    const audioPath = path.join(outputDir, "narration.mp3");
    await fs.writeFile(audioPath, audioBuffer);

    console.log(`Narration audio saved to: ${audioPath}`);
  } catch (error) {
    console.error("Error in narration generation process:", error.stack);
  }
}

main();

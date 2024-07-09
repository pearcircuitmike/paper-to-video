import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpeg from "ffmpeg-static";
import OpenAI from "openai";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

dotenv.config();

const execAsync = promisify(exec);
const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_VIDEO = path.join(OUTPUT_DIR, "video_with_audio.mp4");
const OUTPUT_VIDEO = path.join(OUTPUT_DIR, "video_with_captions.mp4");
const NARRATION_AUDIO = path.join(OUTPUT_DIR, "narration.mp3");
const CAPTIONS_FILE = path.join(OUTPUT_DIR, "captions.vtt");
const SCRIPT_FILE = path.join(OUTPUT_DIR, "script.txt");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_SECRET_KEY,
});

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function generateWhisperPrompt(scriptPath) {
  const scriptContent = await fs.promises.readFile(scriptPath, "utf-8");

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20240620",
    max_tokens: 244,
    messages: [
      {
        role: "user",
        content: `Given the following script content, create a prompt for the OpenAI Whisper API that will help improve transcription accuracy. The prompt should:

1. Include correct spellings of names, technical terms, or unusual words in the script.
2. Reflect the style and tone of the script and enforce grammar, spelling, and punctuation (
3. Provide context that might be relevant to the audio content.
4. Be limited to about 224 tokens, as Whisper only considers the final 224 tokens of the prompt.

Here's the script content:

${scriptContent}

Generate a prompt that follows these guidelines and would be suitable for improving Whisper's transcription of an audio file based on this script. 
Do not modify the original script in any way. 

Your prompt must start with this phrase: 
Add necessary punctuation such as periods, commas, and capitalization ex: "state-of-the-art" vs separate words "state of the art", "What do you think? I like it." vs "What do you think I like it").`,
      },
    ],
  });

  return message.content[0].text;
}

async function transcribeAudio(prompt) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(NARRATION_AUDIO),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    language: "en",
    prompt: "Hello. " + prompt,
  });

  console.log("Whisper API Response:", JSON.stringify(transcription, null, 2));

  return transcription;
}

function splitTextIntoLines(text, maxLineLength) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length > maxLineLength && currentLine.length > 0) {
      lines.push(currentLine.trim());
      currentLine = "";
    }
    currentLine += word + " ";
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.trim());
  }

  return lines;
}

async function generateCaptions(transcription) {
  let vttContent = "WEBVTT\n\n";
  const maxLineLength = 25;

  transcription.segments.forEach((segment) => {
    const startTime = formatTime(segment.start);
    const endTime = formatTime(segment.end);

    const lines = splitTextIntoLines(segment.text.trim(), maxLineLength);
    const captionText = lines.join("\n");

    vttContent += `${startTime} --> ${endTime}\n${captionText}\n\n`;
  });

  // Write to file, overwriting if it exists
  await fs.promises.writeFile(CAPTIONS_FILE, vttContent, { flag: "w" });
  console.log(
    `Captions file ${CAPTIONS_FILE} has been created or overwritten.`
  );
}

function formatTime(seconds) {
  const date = new Date(seconds * 1000);
  return date.toISOString().substr(11, 12);
}
async function addCaptionsToVideo() {
  const command = `${ffmpeg} -y -i "${INPUT_VIDEO}" -vf "subtitles=${CAPTIONS_FILE}:force_style='FontSize=12,MarginV=30'" -c:a copy "${OUTPUT_VIDEO}"`;
  console.log("Executing FFmpeg command:", command);
  const { stdout, stderr } = await execAsync(command);
  console.log("FFmpeg stdout:", stdout);
  console.error("FFmpeg stderr:", stderr);
  console.log(`Output video ${OUTPUT_VIDEO} has been created or overwritten.`);
}

async function main() {
  try {
    console.log("Generating Whisper prompt...");
    const whisperPrompt = await generateWhisperPrompt(SCRIPT_FILE);
    console.log("Generated Whisper prompt:", whisperPrompt);

    console.log("Transcribing audio...");
    const transcription = await transcribeAudio(whisperPrompt);

    console.log("Generating captions...");
    await generateCaptions(transcription);

    console.log("Adding captions to video...");
    await addCaptionsToVideo();

    console.log(`Caption generation complete. Output video: ${OUTPUT_VIDEO}`);
  } catch (error) {
    console.error("Error in caption generation process:", error);
  }
}

main();

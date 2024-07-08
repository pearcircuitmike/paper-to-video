import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpeg from "ffmpeg-static";
import dotenv from "dotenv";

dotenv.config();

const execAsync = promisify(exec);
const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_VIDEO = path.join(OUTPUT_DIR, "video_with_captions.mp4");
const OUTPUT_VIDEO = path.join(OUTPUT_DIR, "youtube_shorts_video.mp4");

const logStep = (step) => console.log(`\n=== ${step} ===`);
const logError = (message) => console.error(`ERROR: ${message}`);

async function convertToYoutubeShorts(inputPath, outputPath) {
  logStep("Converting video to YouTube Shorts format");

  // Ensure the output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Check if the output file already exists
  try {
    await fs.access(outputPath);
    console.log(
      `Output file ${outputPath} already exists. It will be overwritten.`
    );
  } catch (error) {
    // File doesn't exist, which is fine
  }

  const command = `${ffmpeg} -i "${inputPath}" \
    -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
    -c:v libx264 -preset slow -crf 18 \
    -c:a aac -b:a 128k -ar 44100 -ac 2 \
    -y "${outputPath}"`;

  console.log("Executing FFmpeg command:", command);

  try {
    const { stdout, stderr } = await execAsync(command);
    console.log("FFmpeg stdout:", stdout);
    console.error("FFmpeg stderr:", stderr);
    console.log(`Output video ${outputPath} has been created or overwritten.`);
    return outputPath;
  } catch (error) {
    logError(
      `Failed to convert video to YouTube Shorts format: ${error.message}`
    );
    throw error;
  }
}

async function main() {
  try {
    logStep("Starting YouTube Shorts conversion process");

    const shortsVideoPath = await convertToYoutubeShorts(
      INPUT_VIDEO,
      OUTPUT_VIDEO
    );

    console.log("YouTube Shorts conversion process completed successfully!");
    console.log(`Converted video saved at: ${shortsVideoPath}`);
  } catch (error) {
    console.error("Error in YouTube Shorts conversion process:", error.stack);
  }
}

main();

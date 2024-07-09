import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpeg from "ffmpeg-static";
import dotenv from "dotenv";

dotenv.config();

const execAsync = promisify(exec);
const OUTPUT_DIR = path.join(process.cwd(), "output");
const MUSIC_DIR = path.join(process.cwd(), "music");
const INPUT_VIDEO = path.join(OUTPUT_DIR, "video_with_captions.mp4");
const OUTPUT_VIDEO = path.join(OUTPUT_DIR, "youtube_shorts_video.mp4");

const logStep = (step) => console.log(`\n=== ${step} ===`);
const logError = (message) => console.error(`ERROR: ${message}`);

async function getRandomSong() {
  const songs = await fs.readdir(MUSIC_DIR);
  const songFiles = songs.filter(
    (file) => file.startsWith("song") && file.endsWith(".mp3")
  );
  const randomSong = songFiles[Math.floor(Math.random() * songFiles.length)];
  return path.join(MUSIC_DIR, randomSong);
}

async function convertToYoutubeShorts(inputPath, outputPath) {
  logStep("Converting video to YouTube Shorts format with background music");

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

  const randomSong = await getRandomSong();

  const command = `${ffmpeg} -i "${inputPath}" -i "${randomSong}" -filter_complex "[0:a]volume=1[a1];[1:a]volume=0.35[a2];[a1][a2]amix=inputs=2:duration=shortest" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k -ar 44100 -ac 2 -shortest -y "${outputPath}"`;

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

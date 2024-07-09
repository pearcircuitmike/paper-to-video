import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpeg from "ffmpeg-static";

const execAsync = promisify(exec);

const OUTPUT_DIR = path.join(process.cwd(), "output");
const BACKGROUND_VIDEO = path.join(OUTPUT_DIR, "background_video.mp4");
const NARRATION_AUDIO = path.join(OUTPUT_DIR, "narration.mp3");
const VIDEO_NO_AUDIO = path.join(OUTPUT_DIR, "video_no_audio.mp4");
const OUTPUT_VIDEO = path.join(OUTPUT_DIR, "video_with_audio.mp4");

async function ensureOutputDirectoryExists() {
  try {
    await fs.access(OUTPUT_DIR);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
    } else {
      throw error;
    }
  }
}

async function removeAudioFromVideo() {
  try {
    await ensureOutputDirectoryExists();

    // Check if input file exists
    await fs.access(BACKGROUND_VIDEO);

    const command = `${ffmpeg} -y -i "${BACKGROUND_VIDEO}" -c copy -an "${VIDEO_NO_AUDIO}"`;

    console.log("Executing command to remove audio:", command);

    const { stdout, stderr } = await execAsync(command);
    console.log("ffmpeg stdout:", stdout);
    console.log("ffmpeg stderr:", stderr);

    console.log(`Audio removed successfully: ${VIDEO_NO_AUDIO}`);
    return VIDEO_NO_AUDIO;
  } catch (error) {
    console.error("Error in removing audio from video:", error.message);
    throw error;
  }
}

async function addNarrationToVideo() {
  try {
    await ensureOutputDirectoryExists();

    // Check if input files exist
    await fs.access(VIDEO_NO_AUDIO);
    await fs.access(NARRATION_AUDIO);

    const command = `${ffmpeg} -y -i "${VIDEO_NO_AUDIO}" -i "${NARRATION_AUDIO}" -c:v copy -map 0:v -map 1:a -c:a aac -b:a 192k -shortest "${OUTPUT_VIDEO}"`;

    console.log("Executing command to add narration:", command);

    const { stdout, stderr } = await execAsync(command);
    console.log("ffmpeg stdout:", stdout);
    console.log("ffmpeg stderr:", stderr);

    console.log(`Video with narration created successfully: ${OUTPUT_VIDEO}`);
    return OUTPUT_VIDEO;
  } catch (error) {
    console.error("Error in adding narration to video:", error.message);
    throw error;
  }
}

async function main() {
  try {
    await removeAudioFromVideo();
    const outputPath = await addNarrationToVideo();
    console.log("Audio engineering process completed successfully!");
    console.log(`Final video saved at: ${outputPath}`);
  } catch (error) {
    console.error("Error in audio engineering process:", error.stack);
  }
}

main();

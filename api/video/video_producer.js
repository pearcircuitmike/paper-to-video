import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpeg from "ffmpeg-static";
import path from "path";
import getMP3Duration from "get-mp3-duration";
import { createClient as createPexelsClient } from "pexels";

dotenv.config();
const execAsync = promisify(exec);
const OUTPUT_DIR = path.join(process.cwd(), "output");
const SAMPLES_DIR = path.join(process.cwd(), "samples");
const TRIMMED_CLIPS_DIR = path.join(process.cwd(), "trimmed_clips");

const pexelsClient = createPexelsClient(process.env.PEXELS_API_KEY);

const logStep = (step) => console.log(`\n=== ${step} ===`);
const logError = (message) => console.error(`ERROR: ${message}`);

async function fetchPexelsVideos(keywords) {
  logStep("Fetching videos from Pexels");
  const videos = [];
  for (const keyword of keywords) {
    try {
      const response = await pexelsClient.videos.search({
        query: keyword,
        per_page: 3,
      });
      const keywordVideos = response.videos.map((video) => ({
        ...video,
        keyword,
      }));
      videos.push(...keywordVideos);
    } catch (error) {
      logError(
        `Failed to fetch videos for keyword "${keyword}": ${error.message}`
      );
    }
  }

  const filteredVideos = videos.filter((video) => {
    const hdFile = video.video_files.find((file) => file.quality === "hd");
    return hdFile !== undefined;
  });

  console.log(`Fetched ${filteredVideos.length} videos with fps = tbd`);
  return filteredVideos;
}

async function downloadVideo(video) {
  const videoFile = video.video_files.find(
    (file) => file.quality === "hd" && file.width >= 1080
  );
  if (!videoFile) {
    logError(`No suitable video file found for video ${video.id}`);
    return null;
  }

  try {
    const response = await fetch(videoFile.link);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const buffer = await response.buffer();
    const filePath = path.join(SAMPLES_DIR, `pexels_${video.id}.mp4`);
    await fs.writeFile(filePath, buffer);

    console.log(
      `Downloaded video: id=${video.id}, quality=${videoFile.quality}, file_type=${videoFile.file_type}, width=${videoFile.width}, height=${videoFile.height}, fps=${videoFile.fps}`
    );

    return {
      path: filePath,
      id: video.id,
      duration: video.duration,
      width: videoFile.width,
      height: videoFile.height,
      fps: videoFile.fps,
      keyword: video.keyword, // Add keyword to the downloaded video object
    };
  } catch (error) {
    logError(`Failed to download video ${video.id}: ${error.message}`);
    return null;
  }
}

async function trimVideoToRandomDuration(video) {
  if (video.duration <= 3) {
    console.log(`Skipping video ${video.id} as its duration is <= 3 seconds`);
    return null;
  }

  const outputPath = path.join(TRIMMED_CLIPS_DIR, `trimmed_${video.id}.mp4`);
  try {
    const randomTrimTime = (Math.random() * 2 + 1).toFixed(2);
    const command = `${ffmpeg} -i "${video.path}" -t ${randomTrimTime} -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black,fps=fps=23.976,format=yuv420p" -c:v libx264 -preset slow -crf 22 -c:a aac -b:a 128k -ar 44100 -ac 2 -y "${outputPath}"`;
    console.log("Executing trim command:", command);

    const { stdout, stderr } = await execAsync(command);
    console.log(`Trimmed video stdout: ${stdout}`);
    console.log(`Trimmed video stderr: ${stderr}`);

    console.log(`Created 1-3-second clip for ${video.id}`);

    // Get the actual duration of the trimmed video
    const trimmedDuration = parseFloat(randomTrimTime);
    return {
      path: outputPath,
      id: video.id,
      duration: trimmedDuration,
      keyword: video.keyword,
    };
  } catch (error) {
    logError(
      `Failed to create 1-3-second clip for ${video.id}: ${error.message}`
    );
    return null;
  }
}

async function createBackgroundVideo(threeSecondClips, totalDuration) {
  logStep("Creating background video");
  const backgroundVideoPath = path.join(OUTPUT_DIR, "background_video.mp4");
  const tempFilePath = path.join(OUTPUT_DIR, "temp_file_list.txt");

  let currentDuration = 0;
  const clipsToConcatenate = [];

  while (currentDuration < totalDuration) {
    for (const clip of threeSecondClips) {
      if (currentDuration >= totalDuration) break;
      clipsToConcatenate.push(clip.path);
      console.log(
        `Using clip ${clip.id} (Total: ${currentDuration.toFixed(2)}s)`
      );
      currentDuration += clip.duration;
    }
  }

  try {
    // Create a temporary file with the list of video files to concatenate
    const fileList = clipsToConcatenate
      .map((file) => `file '${file}'`)
      .join("\n");
    await fs.writeFile(tempFilePath, fileList);

    const command = [
      ffmpeg,
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      tempFilePath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "-y",
      backgroundVideoPath,
    ].join(" ");

    console.log("Executing command:", command);

    const { stdout, stderr } = await execAsync(command);
    console.log("ffmpeg stdout:", stdout);
    console.log("ffmpeg stderr:", stderr);

    // Clean up the temporary file
    await fs.unlink(tempFilePath);

    console.log(
      `Background video created successfully: ${backgroundVideoPath}`
    );
    return backgroundVideoPath;
  } catch (error) {
    logError(`Failed to create background video: ${error.message}`);
    console.error(error);
    return null;
  }
}

async function main() {
  try {
    logStep("Starting video production process");
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(SAMPLES_DIR, { recursive: true });
    await fs.mkdir(TRIMMED_CLIPS_DIR, { recursive: true });

    const keywordsPath = path.join(OUTPUT_DIR, "keywords.txt");
    const keywords = (await fs.readFile(keywordsPath, "utf-8")).split("\n");

    const audioPath = path.join(OUTPUT_DIR, "narration.mp3");
    const audioBuffer = await fs.readFile(audioPath);
    const audioDuration = getMP3Duration(audioBuffer) / 1000; // Convert to seconds

    const pexelsVideos = await fetchPexelsVideos(keywords);
    const downloadedVideos = await Promise.all(pexelsVideos.map(downloadVideo));
    const validDownloadedVideos = downloadedVideos.filter(Boolean);

    if (validDownloadedVideos.length === 0) {
      throw new Error("No suitable background videos were found");
    }

    // Trim videos and maintain the order according to the keywords
    const threeSecondClips = [];
    let currentDuration = 0;

    for (const keyword of keywords) {
      for (const video of validDownloadedVideos.filter(
        (v) => v.keyword === keyword
      )) {
        if (currentDuration >= audioDuration) break;
        const trimmedClip = await trimVideoToRandomDuration(video);
        if (trimmedClip) {
          threeSecondClips.push(trimmedClip);
          currentDuration += trimmedClip.duration;
        }
      }
      if (currentDuration >= audioDuration) break;
    }

    if (threeSecondClips.length === 0) {
      throw new Error("Failed to create any 1-3-second clips");
    }

    const backgroundVideoPath = await createBackgroundVideo(
      threeSecondClips,
      audioDuration
    );
    if (!backgroundVideoPath) {
      throw new Error("Failed to create background video");
    }

    console.log("Video production process completed successfully!");
    console.log(`Background video saved at: ${backgroundVideoPath}`);

    // No cleanup of intermediate files as per your request
  } catch (error) {
    console.error("Error in video production process:", error.stack);
  }
}

main();

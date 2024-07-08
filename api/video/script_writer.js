import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function getPapers() {
  const { data, error } = await supabase
    .from("arxivPapersData")
    .select("title, abstract, slug")
    .order("totalScore", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data;
}

async function generateNarratorScript(paper) {
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20240620",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Create a concise, engaging script for a 30-second YouTube Short about the following research paper. Your task is to distill the paper's key points into a clear, accessible narrative for a general audience with some technical background.

Paper Title: ${paper.title}
Abstract: ${paper.abstract}

Instructions:
1. Begin with a hook that captures the essence of the research or its potential impact.
2. Summarize the main problem or question the research addresses.
3. Briefly explain the methodology or approach used, focusing on what makes it novel or interesting.
4. Highlight 2-3 key findings or insights from the research.
5. Conclude with the potential implications or future directions of this work.

Style Guidelines:
- Use clear, concise language suitable for verbal narration. Avoid clunky phrases.
- Aim for a conversational tone, similar to popular science YouTube channels.
- Break down complex ideas into simpler terms, but don't oversimplify.
- Use analogies or real-world examples where appropriate to illustrate concepts.
- Each sentence or phrase should be on a new line for easier reading during narration.
- The entire script should be tightly written and take about 60 seconds to read aloud at a natural pace.

Additionally, provide 15-20 visually illustrative keywords that match with the script in a chronological order to "illustrate" the narration. These keywords will be used to search for relevant background videos and must be unambiguous but still broad enough to return results. Think of them more like director's instructions for the visuals.

Format your response as follows:
SCRIPT:
(Your generated script here)

KEYWORDS:
keyword1, keyword2, keyword3, ...

Do not use any introductory or concluding phrases. Start directly with the SCRIPT: heading.`,
      },
    ],
  });

  const content = message.content[0].text;
  const [scriptPart, keywordsPart] = content.split("KEYWORDS:");
  const script = scriptPart.replace("SCRIPT:\n", "").trim();
  const keywords = keywordsPart
    .trim()
    .split(",")
    .map((keyword) => keyword.trim());

  return { script, keywords };
}

async function main() {
  try {
    const papers = await getPapers();
    if (papers.length === 0) {
      console.log("No papers found");
      return;
    }
    const paper = papers[0];
    console.log(`Processing paper: ${paper.title}`);

    const { script, keywords } = await generateNarratorScript(paper);

    const outputDir = path.join(process.cwd(), "output");
    await fs.mkdir(outputDir, { recursive: true });

    const scriptPath = path.join(outputDir, "script.txt");
    await fs.writeFile(scriptPath, script);

    const keywordsPath = path.join(outputDir, "keywords.txt");
    await fs.writeFile(keywordsPath, keywords.join("\n"));

    console.log(`Script saved to: ${scriptPath}`);
    console.log(`Keywords saved to: ${keywordsPath}`);
  } catch (error) {
    console.error("Error in script writing process:", error.stack);
  }
}

main();

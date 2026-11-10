
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const dotenv = require("dotenv");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function convertToWav(inputBuffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      "-i", "pipe:0",
      "-ac", "1",
      "-ar", "16000",
      "-f", "wav",
      "pipe:1",
    ]);

    const output = [];
    let errorOutput = "";

    ffmpeg.stdout.on("data", (chunk) => output.push(chunk));

    ffmpeg.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });

    ffmpeg.on("error", reject);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(output));
      } else {
        reject(new Error(errorOutput || "Audio conversion failed"));
      }
    });

    ffmpeg.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") reject(error);
    });

    ffmpeg.stdin.end(inputBuffer);
  });
}

app.get("/", (req, res) => {
  res.send("Subway Runner voice server is running!");
});

app.post(
  "/api/voice-command",
  upload.single("audio"),
  async (req, res) => {
    try {
      console.log("Voice request received");

      if (!process.env.GNANI_API_KEY) {
        throw new Error("GNANI_API_KEY is missing");
      }

      if (!req.file) {
        return res.status(400).json({
          error: "No audio received",
        });
      }

      console.log("Audio received:", req.file.mimetype);

      const wavBuffer = await convertToWav(req.file.buffer);

      console.log("Audio converted to WAV");

      const form = new FormData();

      form.append(
        "audio_file",
        new Blob([wavBuffer], { type: "audio/wav" }),
        "command.wav"
      );

      form.append("language_code", "hi-IN");
      form.append("preferred_language", "hi-IN");
      form.append("format", "transcribe");
      form.append("itn_native_numerals", "true");

      console.log("Sending audio to Gnani...");

      const response = await fetch(
        "https://api.vachana.ai/stt/v3",
        {
          method: "POST",
          headers: {
            "X-API-Key-ID": process.env.GNANI_API_KEY,
          },
          body: form,
        }
      );

      const responseText = await response.text();

      console.log("Gnani HTTP status:", response.status);

      let result;

      try {
        result = JSON.parse(responseText);
      } catch {
        result = { message: responseText };
      }

      if (!response.ok) {
        console.error("Gnani API error:", responseText);

        return res.status(response.status).json({
          error:
            result?.detail?.message ||
            result?.message ||
            result?.error ||
            "Gnani API request failed",
        });
      }

      const transcript = result.transcript || "";

      console.log("TRANSCRIPT:", transcript);

      return res.json({
        success: true,
        transcript,
      });

    } catch (error) {
      console.error("VOICE SERVER ERROR:", error);

      return res.status(500).json({
        error: error.message || "Voice processing failed",
      });
    }
  }
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Voice server running on port ${PORT}`);
});

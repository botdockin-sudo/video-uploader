const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");

const app = express();

app.use(cors());
app.options("*", cors());
app.use(express.raw({ limit: "100mb", type: "*/*" }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// 📦 Memory storage (video list)
let videos = [];

// 📦 Upload chunk
app.post("/upload-chunk", (req, res) => {
  try {
    const fileName = req.query.filename;
    const index = req.query.index;

    const dir = path.join(__dirname, "uploads", fileName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, index), req.body);

    res.send({ status: "chunk ok" });

  } catch (err) {
    console.log(err);
    res.status(500).send("chunk error");
  }
});

// 🔗 Merge + Telegram + Save
app.post("/merge", async (req, res) => {
  const { filename, totalChunks } = req.query;

  const uploadDir = path.join(__dirname, "uploads", filename);
  const finalPath = path.join(__dirname, filename);

  const writeStream = fs.createWriteStream(finalPath);

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(uploadDir, i.toString());

    if (!fs.existsSync(chunkPath)) {
      console.log("Missing chunk:", i);
      continue;
    }

    writeStream.write(fs.readFileSync(chunkPath));
  }

  writeStream.end();

  writeStream.on("finish", async () => {
    try {
      console.log("Uploading to Telegram...");

      const form = new FormData();
      form.append("chat_id", CHAT_ID);
      form.append("document", fs.createReadStream(finalPath));

      const tg = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
        form,
        { headers: form.getHeaders() }
      );

      const fileId = tg.data.result.document.file_id;

      // 🔥 Save in memory
      videos.push({
        name: filename,
        file_id: fileId,
        time: Date.now()
      });

      res.send({ status: "success" });

    } catch (err) {
      console.log("Telegram error:", err.response?.data || err.message);
      res.send({ status: "failed" });

    } finally {
      // 🧹 delete files
      try {
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        if (fs.existsSync(uploadDir)) {
          fs.rmSync(uploadDir, { recursive: true, force: true });
        }
      } catch {}
    }
  });
});

// 📺 Get videos list
app.get("/videos", (req, res) => {
  res.json(videos);
});

// 🏠 Root
app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

app.listen(3000, () => console.log("Server running 🚀"));

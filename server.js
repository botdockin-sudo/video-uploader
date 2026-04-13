const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.raw({ limit: "100mb", type: "*/*" }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const FIREBASE_URL = process.env.FIREBASE_URL; // 🔥 only URL

// 📦 Upload chunk
app.post("/upload-chunk", (req, res) => {
  try {
    const fileName = req.headers.filename;
    const index = req.headers.index;

    const dir = path.join(__dirname, "uploads", fileName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, index), req.body);

    res.send({ status: "chunk ok" });

  } catch (err) {
    res.status(500).send("chunk error");
  }
});

// 🔗 Merge + Upload + Save + Delete
app.post("/merge", async (req, res) => {
  const { filename, totalChunks } = req.query;

  const uploadDir = path.join(__dirname, "uploads", filename);
  const finalPath = path.join(__dirname, filename);

  const writeStream = fs.createWriteStream(finalPath);

  for (let i = 0; i < totalChunks; i++) {
    const chunk = fs.readFileSync(path.join(uploadDir, i.toString()));
    writeStream.write(chunk);
  }

  writeStream.end();

  writeStream.on("finish", async () => {
    let fileId = null;

    try {
      // 📤 Telegram upload
      const form = new FormData();
      form.append("chat_id", CHAT_ID);
      form.append("video", fs.createReadStream(finalPath));

      const tg = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`,
        form,
        { headers: form.getHeaders() }
      );

      fileId = tg.data.result.video.file_id;

      // 🔥 Firebase save via URL
      await axios.post(`${FIREBASE_URL}/videos.json`, {
        file_id: fileId,
        name: filename,
        time: Date.now()
      });

      res.send({ status: "success", file_id: fileId });

    } catch (err) {
      console.log("Upload fail", err.message);
      res.send({ status: "failed but cleaned" });

    } finally {
      // 🧹 ALWAYS DELETE
      try {
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        if (fs.existsSync(uploadDir)) {
          fs.rmSync(uploadDir, { recursive: true, force: true });
        }
      } catch {}
    }
  });
});

app.listen(3000, () => console.log("Server running 🚀"));

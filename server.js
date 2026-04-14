const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");

const app = express();

// ✅ CORS
app.use(cors());
app.options("*", cors());

// 🔥 ONLY octet-stream (important fix)
app.use(express.raw({
  limit: "200mb",
  type: "application/octet-stream"
}));

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// 📦 Upload chunk
app.post("/upload-chunk", (req, res) => {
  try {
    let fileName = req.query.filename;
    const index = req.query.index;

    if (!fileName || index === undefined) {
      return res.status(400).json({ error: "Missing params" });
    }

    // safe filename
    fileName = fileName.replace(/[^a-zA-Z0-9.]/g, "_");

    const dir = path.join(__dirname, "uploads", fileName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 🔥 अब body हमेशा buffer होगा
    fs.writeFileSync(path.join(dir, index), req.body);

    res.json({ status: "chunk ok" });

  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔗 Merge + Telegram
app.post("/merge", async (req, res) => {
  let { filename, totalChunks } = req.query;

  if (!filename || !totalChunks) {
    return res.status(400).json({ error: "Missing params" });
  }

  filename = filename.replace(/[^a-zA-Z0-9.]/g, "_");

  const uploadDir = path.join(__dirname, "uploads", filename);
  const finalPath = path.join(__dirname, filename);

  try {
    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(uploadDir, i.toString());

      if (!fs.existsSync(chunkPath)) continue;

      writeStream.write(fs.readFileSync(chunkPath));
    }

    writeStream.end();

    // 🔥 wait for finish
    await new Promise(resolve => writeStream.on("finish", resolve));

    // 🔥 check size
    const stats = fs.statSync(finalPath);
    if (stats.size === 0) {
      throw new Error("Final file is empty");
    }

    console.log("Final file size:", stats.size);

    // 📤 Telegram
    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("document", fs.createReadStream(finalPath));

    const tg = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders() }
    );

    res.json({
      status: "success",
      file_id: tg.data.result.document.file_id
    });

  } catch (err) {
    console.log("MERGE ERROR:", err.message);

    res.status(500).json({ error: err.message });

  } finally {
    try {
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      if (fs.existsSync(uploadDir)) {
        fs.rmSync(uploadDir, { recursive: true, force: true });
      }
    } catch {}
  }
});

// Root
app.get("/", (req, res) => {
  res.send("✅ Server running");
});

app.listen(3000, () => console.log("Server running 🚀"));

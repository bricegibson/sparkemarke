// testServer.js
const express = require("express");
const path = require("path");

const app = express();
const PORT = 4000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "test-plotly.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Test server at http://localhost:${PORT}`);
});

const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".3ds": "application/octet-stream", ".webp": "image/webp", ".png": "image/png" };
http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Private-Network": "true" });
    return res.end();
  }
  if (req.method === "POST" && req.url.startsWith("/save/")) {
    const name = path.basename(req.url.slice(6).split("?")[0]);
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      // text save: .html/.txt bodies are written as-is; images arrive as data URLs.
      const dir = path.join(__dirname, "dumps", path.dirname(req.url.slice(6)));
      fs.mkdirSync(dir, { recursive: true });
      const out = path.join(dir, name);
      if (/.(html|txt)$/.test(name) || !body.subarray(0, 5).toString().startsWith("data:")) { fs.writeFileSync(out, body); res.writeHead(200, { "Access-Control-Allow-Origin": "*" }); res.end("saved"); return; }
      else fs.writeFileSync(path.join(__dirname, "dumps", name), Buffer.from(body.toString().replace("data:image/png;base64,", ""), "base64"));
      res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Private-Network": "true" }); res.end("saved");
    });
    return;
  }
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(5178, () => console.log("serving on 5178"));

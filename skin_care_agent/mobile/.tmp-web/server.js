const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const apiBase = "http://127.0.0.1:8000";
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

http
  .createServer((request, response) => {
    const url = request.url || "/";
    if (url.startsWith("/api/")) {
      const target = new URL(url, apiBase);
      const upstream = http.request(
        target,
        { method: request.method, headers: { ...request.headers, host: target.host } },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        },
      );
      upstream.on("error", () => response.writeHead(502).end());
      request.pipe(upstream);
      return;
    }

    const pathname = decodeURIComponent(url.split("?")[0]);
    let file = path.join(root, pathname === "/" ? "index.html" : pathname);
    if (!file.startsWith(root)) return response.writeHead(403).end();
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    fs.readFile(file, (error, data) => {
      if (error) return response.writeHead(404).end();
      if (path.extname(file) === ".js") data = Buffer.from(data.toString().replaceAll("http://127.0.0.1:8000/api/v1", "/api/v1"));
      response.writeHead(200, { "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream" });
      response.end(data);
    });
  })
  .listen(8083, "127.0.0.1", () => console.log("Web ready: http://127.0.0.1:8083"));

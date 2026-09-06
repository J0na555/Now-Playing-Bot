// Local dev server that mimics Vercel's Node runtime well enough to run the
// api/*.ts handlers natively under Node's type stripping (Node 26+). The real
// deployment still goes through Vercel/esbuild unchanged.
//
// Usage: node scripts/dev-server.mjs
//   - route      -> handler file under api/
//   - port       -> process.env.PORT || 3000
//   - env files  -> provided by the `dev` npm script via --env-file-if-exists
//
// Handlers get a (req, res) pair shaped like @vercel/node's VercelRequest /
// VercelResponse: req.method, req.headers (lowercased), req.url, req.body
// (JSON body for POST with a JSON content-type, else undefined), and a
// chainable res with status/json/setHeader/end/send.

import http from "node:http";

const PORT = process.env.PORT || 3000;

function lowerCaseHeaders(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = v;
  return out;
}

function makeReq(nodeReq, body) {
  return {
    method: nodeReq.method,
    headers: lowerCaseHeaders(nodeReq.headers),
    url: nodeReq.url,
    body,
  };
}

function makeRes(nodeRes) {
  let statusCode = 200;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      nodeRes.setHeader(name, value);
      return this;
    },
    json(payload) {
      nodeRes.statusCode = statusCode;
      nodeRes.setHeader("Content-Type", "application/json");
      nodeRes.end(JSON.stringify(payload));
      return this;
    },
    send(body) {
      nodeRes.statusCode = statusCode;
      nodeRes.end(body);
      return this;
    },
    end(body) {
      nodeRes.statusCode = statusCode;
      nodeRes.end(body);
      return this;
    },
  };
}

async function readBody(nodeReq) {
  const contentType = (nodeReq.headers["content-type"] ?? "").toLowerCase();
  const isJsonPost =
    nodeReq.method === "POST" && contentType.includes("application/json");
  if (!isJsonPost) return undefined;

  const chunks = [];
  for await (const chunk of nodeReq) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Leave raw text so the handler's own JSON.parse can surface it, or let it
    // pass through the handler's validation error path.
    return text;
  }
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  const url = new URL(nodeReq.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  const routeToFile = {
    "/api/health": "./api/health.ts",
    "/api/poll": "./api/poll.ts",
    "/api/push": "./api/push.ts",
  }[pathname];

  if (!routeToFile) {
    nodeRes.statusCode = 404;
    nodeRes.setHeader("Content-Type", "application/json");
    nodeRes.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const body = await readBody(nodeReq);
  const req = makeReq(nodeReq, body);
  const res = makeRes(nodeRes);

  try {
    const mod = await import(routeToFile);
    await mod.default(req, res);
  } catch (err) {
    console.error(`dev-server: handler ${pathname} failed:`, err);
    if (!nodeRes.writableEnded) {
      nodeRes.statusCode = 500;
      nodeRes.setHeader("Content-Type", "application/json");
      nodeRes.end(
        JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" })
      );
    }
  }
});

server.listen(PORT, () => {
  console.log(`dev server listening on http://localhost:${PORT}`);
  console.log("env loading: .env + .env.local merged by the `dev` script (later flags override).");
});

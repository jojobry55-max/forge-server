import express from "express";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Tables : users + codes de liaison
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      roblox_id TEXT UNIQUE,
      username TEXT,
      credits INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS link_codes (
      code TEXT PRIMARY KEY,
      used BOOLEAN DEFAULT FALSE,
      roblox_id TEXT,
      username TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("Base de donnees prete (users + link_codes).");
}
initDatabase().catch((e) => console.error("Erreur init DB:", e));

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
let mailbox = null;

app.get("/", (req, res) => res.send("FORGE server is running!"));

// ---------- CODES DE LIAISON ----------

// (1) Le SITE demande un nouveau code de liaison
app.post("/link/new", async (req, res) => {
  try {
    // genere un code du type FORGE-1234
    const code = "FORGE-" + Math.floor(1000 + Math.random() * 9000);
    await pool.query("INSERT INTO link_codes (code) VALUES ($1)", [code]);
    res.json({ status: "ok", code: code });
  } catch (err) {
    res.status(500).json({ error: "Erreur creation code", details: String(err) });
  }
});

// (2) Le PLUGIN envoie le code + l'identite Roblox lue dans Studio
app.post("/link/confirm", async (req, res) => {
  try {
    const { code, roblox_id, username } = req.body;
    if (!code || !roblox_id) return res.status(400).json({ error: "code et roblox_id requis" });

    const found = await pool.query("SELECT * FROM link_codes WHERE code = $1", [code]);
    if (found.rows.length === 0) return res.status(404).json({ error: "Code introuvable" });
    if (found.rows[0].used) return res.status(400).json({ error: "Code deja utilise" });

    // marque le code comme utilise et enregistre l'identite
    await pool.query(
      "UPDATE link_codes SET used = TRUE, roblox_id = $1, username = $2 WHERE code = $3",
      [String(roblox_id), username || "Inconnu", code]
    );
    // cree (ou met a jour) l'utilisateur
    await pool.query(
      `INSERT INTO users (roblox_id, username, credits) VALUES ($1, $2, 0)
       ON CONFLICT (roblox_id) DO UPDATE SET username = EXCLUDED.username`,
      [String(roblox_id), username || "Inconnu"]
    );
    res.json({ status: "ok", message: "Compte lie", username: username });
  } catch (err) {
    res.status(500).json({ error: "Erreur liaison", details: String(err) });
  }
});

// (3) Le SITE verifie si un code a ete lie (pour afficher le profil)
app.get("/link/status/:code", async (req, res) => {
  try {
    const found = await pool.query("SELECT * FROM link_codes WHERE code = $1", [req.params.code]);
    if (found.rows.length === 0) return res.status(404).json({ error: "Code introuvable" });
    const row = found.rows[0];
    if (row.used) {
      res.json({
        linked: true,
        roblox_id: row.roblox_id,
        username: row.username,
        avatar: "https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=" + row.roblox_id + "&size=150x150&format=Png&isCircular=false",
      });
    } else {
      res.json({ linked: false });
    }
  } catch (err) {
    res.status(500).json({ error: "Erreur statut", details: String(err) });
  }
});

// ---------- IA (inchange) ----------

async function generateFromAI(userPrompt) {
  const sys =
    "Tu es FORGE, expert du developpement Roblox (Luau) qui CONSTRUIT dans le workspace.\n" +
    "Reponds EXACTEMENT dans ce format texte, rien d'autre :\n" +
    "CAT: categorie courte\n" +
    "SUM: resume en une phrase\n" +
    "NAME: nom court du build\n" +
    "STEP: une etape\n" +
    "(2 a 5 lignes STEP)\n" +
    "Puis les actions, une par ligne :\n" +
    "Part : P,nom,forme,px,py,pz,sx,sy,sz,r,g,b,material\n" +
    "Script : S,nom,type,parent,code\n" +
    "forme = Block ou Ball ou Cylinder ou Wedge. r,g,b entre 0 et 255.\n" +
    "material = Plastic,Wood,Grass,Slate,Concrete,Metal,Neon,Sand,Brick,Marble,Ice.\n" +
    "parent = ServerScriptService,ReplicatedStorage,StarterGui,StarterPlayerScripts,Workspace.\n" +
    "Pose au sol (py = sy/2), empile vers le haut. Un arbre = tronc Cylinder marron + feuillage vert. Max 20 parts.\n" +
    "AUCUN texte hors format. Pas de Markdown.";

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.4 },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));

  let raw = "";
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    for (const part of data.candidates[0].content.parts) {
      if (part.text) raw += part.text;
    }
  }
  return { result: parseCompact(raw), raw: raw };
}

function parseCompact(raw) {
  const result = { category: "Build", summary: "", buildName: "Build", steps: [], actions: [] };
  const lines = raw.split("\n");
  for (const rawLine of lines) {
    let t = rawLine.trim();
    if (t === "") continue;
    t = t.replace(/^Part\s*:\s*/i, "").replace(/^Script\s*:\s*/i, "").replace(/^[-*]\s*/, "");
    if (t.startsWith("CAT:")) {
      result.category = t.slice(4).trim();
    } else if (t.startsWith("SUM:")) {
      result.summary = t.slice(4).trim();
    } else if (t.startsWith("NAME:")) {
      result.buildName = t.slice(5).trim();
    } else if (t.startsWith("STEP:")) {
      result.steps.push(t.slice(5).trim());
    } else if (t.startsWith("P,")) {
      const p = t.split(",");
      if (p.length >= 13) {
        result.actions.push({
          tool: "create_part",
          name: p[1], shape: p[2],
          px: Number(p[3]) || 0, py: Number(p[4]) || 0, pz: Number(p[5]) || 0,
          sx: Number(p[6]) || 1, sy: Number(p[7]) || 1, sz: Number(p[8]) || 1,
          r: Number(p[9]) || 150, g: Number(p[10]) || 150, b: Number(p[11]) || 150,
          material: p[12] ? p[12].trim() : "Plastic",
          anchored: true,
        });
      }
    } else if (t.startsWith("S,")) {
      const p = t.split(",");
      if (p.length >= 5) {
        const code = p.slice(4).join(",").replace(/\\n/g, "\n");
        result.actions.push({
          tool: "create_script",
          name: p[1], scriptType: p[2], parent: p[3], source: code,
        });
      }
    }
  }
  return result;
}

app.post("/submit", async (req, res) => {
  try {
    const userPrompt = req.body.prompt;
    if (!userPrompt) return res.status(400).json({ error: "Aucun prompt" });
    if (!GEMINI_API_KEY) return res.status(500).json({ error: "Cle non configuree" });
    const { result, raw } = await generateFromAI(userPrompt);
    mailbox = result;
    res.json({ status: "ok", preview: result.summary, parts: result.actions.length, raw_ai: raw });
  } catch (err) {
    res.status(500).json({ error: "Erreur generation", details: String(err) });
  }
});

app.get("/poll", (req, res) => {
  if (mailbox) {
    const toSend = mailbox;
    mailbox = null;
    res.json({ hasWork: true, job: toSend });
  } else {
    res.json({ hasWork: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("FORGE server demarre sur le port " + PORT));

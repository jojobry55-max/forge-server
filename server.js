import express from "express";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

let mailbox = null;

app.get("/", (req, res) => res.send("FORGE server is running!"));

async function generateFromAI(userPrompt) {
  const sys =
    "Tu es FORGE, expert du developpement Roblox (Luau) qui CONSTRUIT dans le workspace.\n" +
    "Reponds EXACTEMENT dans ce format texte, rien d'autre :\n" +
    "CAT: <categorie courte>\n" +
    "SUM: <resume en une phrase>\n" +
    "NAME: <nom court du build>\n" +
    "STEP: <etape>\n" +
    "(2 a 5 lignes STEP)\n" +
    "Puis les actions, une par ligne :\n" +
    "Part : P,<nom>,<Block|Ball|Cylinder|Wedge>,<px>,<py>,<pz>,<sx>,<sy>,<sz>,<r>,<g>,<b>,<material>\n" +
    "Script : S,<nom>,<Script|LocalScript|ModuleScript>,<parent>,<code luau une ligne avec \\n>\n" +
    "Regles: pose au sol (py = sy/2), empile vers le haut. r,g,b entre 0 et 255. " +
    "material: Plastic,Wood,Grass,Slate,Concrete,Metal,Neon,Sand,Brick,Marble,Ice. " +
    "parent: ServerScriptService,ReplicatedStorage,StarterGui,StarterPlayerScripts,Workspace. " +
    "Un arbre = tronc Cylinder marron + feuillage vert. Max 20 parts.\n" +
    "AUCUN texte hors format. Pas de Markdown, pas de trois backticks.";

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
  if (data.candidates?.[0]?.content?.parts) {
    for (const part of data.candidates[0].content.parts) if (part.text) raw += part.text;
  }
  return parseCompact(raw);
}

function parseCompact(raw) {
  const result = { category: "Build", summary: "", buildName: "Build", steps: [], actions: [] };
  const lines = raw.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t === "") continue;
    if (t.startsWith("CAT:")) result.category = t.slice(4).trim();
    else if (t.startsWith("SUM:")) result.summary = t.slice(4).trim();
    else if (t.startsWith("NAME:")) result.buildName = t.slice(5).trim();
    else if (t.startsWith("STEP:")) result.steps.push(t.slice(5).trim());
    else if (t.startsWith("P,")) {
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
    }
    else if (t.startsWith("S,")) {
      const p = t.split(",");
      if (p.length >= 5) {
        const code = p.slice(4).join(",").replace(/\\n/g, "\n");
        result.actions.push({ tool: "create_script", name: p[1], scriptType: p[2], parent: p[3], source: code });
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
    const result = await generateFromAI(userPrompt);
    mailbox = result;
    res.json({ status: "ok", preview: result.summary, parts: result.actions.length });
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

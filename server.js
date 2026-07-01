import express from "express";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

let mailbox = null;

app.get("/", (req, res) => res.send("FORGE server is running!"));

// Appel IA en FORMAT COMPACT
async function generateFromAI(userPrompt) {
  const sys =
    "Tu es FORGE, expert du developpement Roblox (Luau) qui CONSTRUIT dans le workspace.\n" +
    "Reponds EXACTEMENT dans ce format texte, rien d'autre :\n" +
    "CAT: <categorie courte>\n" +
    "SUM: <resume en une phrase, langue de l'utilisateur>\n" +
    "NAME: <nom court du build>\n" +
    "STEP: <etape 1>\n" +
    "STEP: <etape 2>\n" +
    "(2 a 5 lignes STEP)\n" +
    "Puis les actions, une par ligne :\n" +
    "Pour une part : P,<nom>,<shape Block|Ball|Cylinder|Wedge>,<px>,<py>,<pz>,<sx>,<sy>,<sz>,<r>,<g>,<b>,<material>\n" +
    "Pour un script : S,<nom>,<Script|LocalScript|ModuleScript>,<parent>,<code luau sur une seule ligne avec \\n pour les retours>\n" +
    "Regles: pose au sol (py = sy/2), empile vers le haut. r,g,b entre 0 et 255. " +
    "material: Plastic,Wood,Grass,Slate,Concrete,Metal,Neon,Sand,Brick,Marble,Ice. " +
    "parent: ServerScriptService,ReplicatedStorage,StarterGui,StarterPlayerScripts,Workspace. " +
    "Un arbre = tronc Cylinder marron + feuillage vert (Ball/Block). Sois concis. Max 20 parts.\n" +
    "N'ecris AUCUN texte hors de ce format. Pas de Markdown, pas de ```.";

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

// Transforme le format compact en objet propre (ANTI-CRASH)
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
      // P,name,shape,px,py,pz,sx,sy,sz,r,g,b,material = 13 champs
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
      // si la ligne est coupee (moins de 13 champs), on l'IGNORE proprement -> pas de crash
    }
    else if (t.startsWith("S,")) {
      // S,name,type,parent,code...  (le code peut contenir des virgules -> on recolle)
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
app.listen(PORT, () => console.log("FORGE server demarre sur le port " + PORT));          properties: {
            tool: { type: "STRING" }, name: { type: "STRING" }, shape: { type: "STRING" },
            px: { type: "NUMBER" }, py: { type: "NUMBER" }, pz: { type: "NUMBER" },
            sx: { type: "NUMBER" }, sy: { type: "NUMBER" }, sz: { type: "NUMBER" },
            r: { type: "NUMBER" }, g: { type: "NUMBER" }, b: { type: "NUMBER" },
            material: { type: "STRING" }, anchored: { type: "BOOLEAN" },
            parent: { type: "STRING" }, scriptType: { type: "STRING" }, source: { type: "STRING" },
          },
        },
      },
    },
    required: ["category", "summary", "steps", "actions"],
  };

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, maxOutputTokens: 8192 },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  let raw = "";
  if (data.candidates?.[0]?.content?.parts) {
    for (const part of data.candidates[0].content.parts) if (part.text) raw += part.text;
  }
  const finishReason = data.candidates?.[0]?.finishReason;
  try {
    return JSON.parse(raw);
  } catch (e) {
    if (finishReason === "MAX_TOKENS") {
      throw new Error("La reponse IA etait trop longue (coupee). Demande plus simple ou augmente maxOutputTokens.");
    }
    throw new Error("JSON invalide de l'IA: " + String(e));
  }
}

// PORTE 1 : le site DEPOSE une demande
app.post("/submit", async (req, res) => {
  try {
    const userPrompt = req.body.prompt;
    if (!userPrompt) return res.status(400).json({ error: "Aucun prompt" });
    if (!GEMINI_API_KEY) return res.status(500).json({ error: "Cle non configuree" });

    const result = await generateFromAI(userPrompt);
    mailbox = result;              // on range dans le casier
    res.json({ status: "ok", message: "Demande deposee, le plugin va la recuperer.", preview: result.summary });
  } catch (err) {
    res.status(500).json({ error: "Erreur generation", details: String(err) });
  }
});

// PORTE 2 : le plugin RECUPERE ce qui attend
app.get("/poll", (req, res) => {
  if (mailbox) {
    const toSend = mailbox;
    mailbox = null;               // on vide le casier
    res.json({ hasWork: true, job: toSend });
  } else {
    res.json({ hasWork: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("FORGE server demarre sur le port " + PORT));

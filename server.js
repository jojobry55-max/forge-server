import express from "express";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

// LA BOITE AUX LETTRES (un seul casier partage pour l'instant)
let mailbox = null; // contiendra la derniere generation en attente

app.get("/", (req, res) => {
  res.send("FORGE server is running!");
});

// Fonction interne : appelle l'IA et renvoie les actions
async function generateFromAI(userPrompt) {
  const sys =
    "Tu es FORGE, un assistant expert du developpement Roblox (Luau) qui CONSTRUIT dans le workspace. " +
    "Analyse la demande et choisis une categorie courte (Build, Script, UI, Systeme, Debug). " +
    "Donne un resume bref (summary) et un plan (steps) de 2 a 5 etapes, dans la langue de l'utilisateur. " +
    "Fournis des ACTIONS concretes avec ces outils: " +
    "create_part (name, shape [Block|Ball|Cylinder|Wedge], px,py,pz, sx,sy,sz, r,g,b (0-255), material, anchored) ; " +
    "create_script (name, scriptType [Script|LocalScript|ModuleScript], parent [ServerScriptService|ReplicatedStorage|StarterGui|StarterPlayerScripts|Workspace], source). " +
    "REGLE ABSOLUE: si la demande implique de creer quelque chose, 'actions' ne doit JAMAIS etre vide. " +
    "Pose les objets au sol (py = sy/2), empile vers le haut. Un arbre = tronc Cylinder marron + feuillage vert. Max 15 parts.";

  const schema = {
    type: "OBJECT",
    properties: {
      category: { type: "STRING" }, summary: { type: "STRING" }, buildName: { type: "STRING" },
      steps: { type: "ARRAY", items: { type: "STRING" } },
      actions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
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
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, maxOutputTokens: 4096 },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  let raw = "";
  if (data.candidates?.[0]?.content?.parts) {
    for (const part of data.candidates[0].content.parts) if (part.text) raw += part.text;
  }
  return JSON.parse(raw);
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

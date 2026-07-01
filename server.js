import express from "express";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

app.get("/", (req, res) => {
  res.send("FORGE server is running!");
});

app.post("/generate", async (req, res) => {
  try {
    const userPrompt = req.body.prompt;
    if (!userPrompt) return res.status(400).json({ error: "Aucun prompt fourni" });
    if (!GEMINI_API_KEY) return res.status(500).json({ error: "Cle API non configuree" });

    const sys =
      "Tu es FORGE, un assistant expert du developpement Roblox (Luau) qui CONSTRUIT dans le workspace. " +
      "Analyse la demande et choisis une categorie courte (Build, Script, UI, Systeme, Debug). " +
      "Donne un resume bref (summary) et un plan (steps) de 2 a 5 etapes, dans la langue de l'utilisateur. " +
      "Fournis des ACTIONS concretes avec ces outils: " +
      "create_part (name, shape [Block|Ball|Cylinder|Wedge], px,py,pz, sx,sy,sz, r,g,b (0-255), material, anchored) ; " +
      "create_script (name, scriptType [Script|LocalScript|ModuleScript], parent [ServerScriptService|ReplicatedStorage|StarterGui|StarterPlayerScripts|Workspace], source). " +
      "REGLE ABSOLUE: si la demande implique de creer quelque chose, le tableau 'actions' ne doit JAMAIS etre vide. " +
      "Pose les objets au sol (py = sy/2), empile vers le haut. Un arbre = tronc Cylinder marron + feuillage vert. Max 15 parts.";

    const schema = {
      type: "OBJECT",
      properties: {
        category: { type: "STRING" },
        summary: { type: "STRING" },
        buildName: { type: "STRING" },
        steps: { type: "ARRAY", items: { type: "STRING" } },
        actions: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              tool: { type: "STRING" },
              name: { type: "STRING" }, shape: { type: "STRING" },
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
    if (!response.ok) return res.status(response.status).json({ error: "Erreur API Gemini", details: data });

    let raw = "";
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) if (part.text) raw += part.text;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({ error: "Reponse IA illisible", raw: raw });
    }

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur", details: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("FORGE server demarre sur le port " + PORT));

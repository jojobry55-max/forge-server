import express from "express";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash"; // modele gratuit pour les tests

// Route de test
app.get("/", (req, res) => {
  res.send("FORGE server is running!");
});

// Route qui appelle l'IA
// Le plugin/site enverra { "prompt": "un cube rouge" } et recevra la reponse
app.post("/generate", async (req, res) => {
  try {
    const userPrompt = req.body.prompt;
    if (!userPrompt) {
      return res.status(400).json({ error: "Aucun prompt fourni" });
    }
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Cle API non configuree sur le serveur" });
    }

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "Tu es FORGE, un assistant expert du developpement Roblox. Reponds en Luau valide et concis." }],
        },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: "Erreur API Gemini", details: data });
    }

    // Extraire le texte de la reponse
    let text = "";
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) text += part.text;
      }
    }

    res.json({ result: text });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur", details: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("FORGE server demarre sur le port " + PORT);
});

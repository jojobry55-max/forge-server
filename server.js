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
    "Donne un resume bref (summary) et un plan (steps) de 2 a 5 etapes, dans la langue

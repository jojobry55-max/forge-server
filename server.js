import express from "express";

const app = express();
app.use(express.json());

// Route de test : dit juste "allo, je reponds"
app.get("/", (req, res) => {
  res.send("FORGE server is running!");
});

// Une route qui renvoie un petit message en JSON
app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "FORGE server est bien en ligne" });
});

// Demarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("FORGE server demarre sur le port " + PORT);
});

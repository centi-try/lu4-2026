import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    console.error(`[config] Falta la variable de entorno requerida: ${name}`);
    process.exit(1);
  }
  return String(value).trim();
}

export const config = {
  discordToken: required("DISCORD_BOT_TOKEN"),
  clientId: required("DISCORD_CLIENT_ID"),
  guildId: required("DISCORD_GUILD_ID"),
  apiBaseUrl: required("API_BASE_URL").replace(/\/+$/, ""),
  botApiKey: required("BOT_API_KEY"),
};

// Categorías válidas — deben coincidir con las del servidor
// (server/_core/index.ts → BOT_ITEM_CATEGORIES).
export const CATEGORIES = [
  { label: "Armadura", value: "ARMADURA" },
  { label: "Arma", value: "ARMA" },
  { label: "Joya", value: "JOYA" },
  { label: "Key", value: "KEY" },
  { label: "Recipe", value: "RECIPE" },
  { label: "Materiales", value: "MATERIALES" },
  { label: "Quest", value: "QUEST" },
  { label: "Adena", value: "ADENA" },
  { label: "Scroll", value: "SCROLL" },
  { label: "Personajes", value: "PERSONAJES" },
  { label: "Life Stone", value: "LIFE_STONE" },
];

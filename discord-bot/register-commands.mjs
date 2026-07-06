// Registra el slash command /vender en el servidor (guild) de Discord.
// Ejecutar una vez (y cada vez que cambien las opciones del comando):
//   node register-commands.mjs
import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { config, CATEGORIES } from "./config.mjs";

const venderCommand = new SlashCommandBuilder()
  .setName("vender")
  .setDescription("Registra un ítem para venta (queda pendiente de confirmación del Super Admin).")
  .addStringOption((opt) =>
    opt.setName("nombre").setDescription("Nombre del ítem").setRequired(true).setMaxLength(120)
  )
  .addStringOption((opt) => {
    opt.setName("categoria").setDescription("Categoría del ítem").setRequired(true);
    for (const c of CATEGORIES) opt.addChoices({ name: c.label, value: c.value });
    return opt;
  })
  .addIntegerOption((opt) =>
    opt.setName("precio").setDescription("Precio en adena (número entero > 0)").setRequired(true).setMinValue(1)
  )
  .addIntegerOption((opt) =>
    opt.setName("cantidad").setDescription("Cantidad / stock").setRequired(true).setMinValue(1)
  );

const rest = new REST({ version: "10" }).setToken(config.discordToken);

try {
  console.log("Registrando slash command /vender en el guild...");
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: [venderCommand.toJSON()],
  });
  console.log("✅ Comando /vender registrado correctamente.");
} catch (err) {
  console.error("❌ Error registrando comandos:", err);
  process.exit(1);
}

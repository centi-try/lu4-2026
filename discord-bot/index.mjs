// Bot de Discord de RaptorSquad.
// /vender abre un formulario: primero pide nombre/categoría/precio/cantidad
// (opciones del comando) y luego muestra DROPDOWNS (select menus) para elegir
// "Personajes asociados" (multi) y "Responsable del ítem" (uno solo), poblados
// en vivo con los usuarios de la app. Al confirmar, registra el ítem en estado
// EN_REGISTRO para que el Super Admin lo confirme desde la web.
import {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { config } from "./config.mjs";

// Estado en memoria de cada formulario /vender en curso, por sesión.
// TTL de 15 min para que no crezca indefinidamente.
const sessions = new Map();
const SESSION_TTL_MS = 15 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(sid);
  }
}, 60 * 1000).unref?.();

function newSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function apiGet(pathname) {
  const res = await fetch(`${config.apiBaseUrl}${pathname}`, {
    headers: { "x-bot-api-key": config.botApiKey },
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function registerItem(payload) {
  const res = await fetch(`${config.apiBaseUrl}/api/bot/items`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bot-api-key": config.botApiKey },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// Construye las filas de componentes (dropdowns + botones) para una sesión.
function buildComponents(sid, users, selection) {
  const options = users.slice(0, 25).map((u) => ({
    label: u.name.slice(0, 100),
    value: String(u.id),
    default: selection.personajes.includes(String(u.id)),
  }));

  const personajesMenu = new StringSelectMenuBuilder()
    .setCustomId(`vender:personajes:${sid}`)
    .setPlaceholder("Personajes asociados (elige uno o varios)")
    .setMinValues(0)
    .setMaxValues(Math.max(1, options.length))
    .addOptions(options.length ? options : [{ label: "Sin usuarios", value: "none" }]);

  const responsableOptions = [
    { label: "— Sin responsable —", value: "none", default: !selection.responsable },
    ...users.slice(0, 24).map((u) => ({
      label: u.name.slice(0, 100),
      value: String(u.id),
      default: selection.responsable === String(u.id),
    })),
  ];

  const responsableMenu = new StringSelectMenuBuilder()
    .setCustomId(`vender:responsable:${sid}`)
    .setPlaceholder("Responsable del ítem (una sola persona)")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(responsableOptions);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`vender:confirm:${sid}`).setLabel("Registrar ítem").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`vender:cancel:${sid}`).setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
  );

  return [
    new ActionRowBuilder().addComponents(personajesMenu),
    new ActionRowBuilder().addComponents(responsableMenu),
    buttons,
  ];
}

function summaryText(s, users) {
  const nameById = new Map(users.map((u) => [String(u.id), u.name]));
  const personajes = s.selection.personajes.length
    ? s.selection.personajes.map((id) => nameById.get(id) || id).join(", ")
    : "(ninguno)";
  const responsable = s.selection.responsable ? nameById.get(s.selection.responsable) || s.selection.responsable : "(ninguno)";
  return [
    `📦 **${s.item.name}**`,
    `🏷️ Categoría: **${s.item.category}**`,
    `💰 Precio: **${s.item.price.toLocaleString("es-CL")}** adena`,
    `🔢 Cantidad: **${s.item.quantity}**`,
    ``,
    `👥 Personajes asociados: **${personajes}**`,
    `👤 Responsable: **${responsable}**`,
    ``,
    `Selecciona en los menús y pulsa **Registrar ítem**. Quedará EN_REGISTRO (pendiente de confirmación).`,
  ].join("\n");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot conectado como ${c.user.tag}`);
  const ping = await apiGet("/api/bot/ping").catch(() => ({ status: 0 }));
  if (ping.status === 200) console.log(`✅ Conexión con la API OK (${config.apiBaseUrl}).`);
  else console.warn(`⚠️  La API respondió ${ping.status}. Revisa BOT_API_KEY / API_BASE_URL.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // 1) Slash command /vender → arma la sesión y muestra los dropdowns.
    if (interaction.isChatInputCommand() && interaction.commandName === "vender") {
      const item = {
        name: interaction.options.getString("nombre", true),
        category: interaction.options.getString("categoria", true),
        price: interaction.options.getInteger("precio", true),
        quantity: interaction.options.getInteger("cantidad", true),
      };

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const usersRes = await apiGet("/api/bot/users");
      if (usersRes.status !== 200 || !usersRes.data?.ok) {
        await interaction.editReply(`❌ No pude obtener la lista de usuarios (API respondió ${usersRes.status}).`);
        return;
      }
      const users = usersRes.data.users || [];

      const sid = newSessionId();
      const session = {
        createdAt: Date.now(),
        ownerId: interaction.user.id,
        userTag: interaction.user.tag || interaction.user.id,
        item,
        users,
        selection: { personajes: [], responsable: null },
      };
      sessions.set(sid, session);

      await interaction.editReply({
        content: summaryText(session, users),
        components: buildComponents(sid, users, session.selection),
      });
      return;
    }

    // 2) Interacciones de componentes (dropdowns / botones) del formulario.
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
      const parts = interaction.customId.split(":");
      if (parts[0] !== "vender") return;
      const [, kind, sid] = parts;
      const session = sessions.get(sid);

      if (!session) {
        await interaction.reply({ content: "⏱️ Este formulario expiró. Vuelve a ejecutar `/vender`.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== session.ownerId) {
        await interaction.reply({ content: "Este formulario pertenece a otra persona.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (kind === "personajes") {
        session.selection.personajes = interaction.values.filter((v) => v !== "none");
        await interaction.update({ content: summaryText(session, session.users), components: buildComponents(sid, session.users, session.selection) });
        return;
      }

      if (kind === "responsable") {
        const val = interaction.values[0];
        session.selection.responsable = val === "none" ? null : val;
        await interaction.update({ content: summaryText(session, session.users), components: buildComponents(sid, session.users, session.selection) });
        return;
      }

      if (kind === "cancel") {
        sessions.delete(sid);
        await interaction.update({ content: "❌ Registro cancelado.", components: [] });
        return;
      }

      if (kind === "confirm") {
        await interaction.update({ content: "⏳ Registrando ítem...", components: [] });
        const payload = {
          name: session.item.name,
          category: session.item.category,
          price: session.item.price,
          quantity: session.item.quantity,
          associatedCharacterIds: session.selection.personajes.map(Number),
          responsibleUserId: session.selection.responsable ? Number(session.selection.responsable) : null,
          source: `discord:${session.userTag}`,
        };
        const { status, data } = await registerItem(payload);
        sessions.delete(sid);

        if (status === 200 && data?.ok) {
          const nameById = new Map(session.users.map((u) => [String(u.id), u.name]));
          const personajes = payload.associatedCharacterIds.length
            ? payload.associatedCharacterIds.map((id) => nameById.get(String(id)) || id).join(", ")
            : "(ninguno)";
          const responsable = payload.responsibleUserId ? nameById.get(String(payload.responsibleUserId)) || payload.responsibleUserId : "(ninguno)";
          await interaction.editReply({
            content: [
              `✅ Ítem registrado y **pendiente de confirmación** del Super Admin.`,
              ``,
              `📦 **${session.item.name}** · 🏷️ ${session.item.category} · 💰 ${session.item.price.toLocaleString("es-CL")} · 🔢 ${session.item.quantity}`,
              `👥 Personajes: **${personajes}**`,
              `👤 Responsable: **${responsable}**`,
            ].join("\n"),
            components: [],
          });
        } else {
          await interaction.editReply({ content: `❌ No se pudo registrar: ${data?.message || `el servidor respondió ${status}`}`, components: [] });
        }
        return;
      }
    }
  } catch (err) {
    console.error("[interaction] error:", err);
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: "❌ Error inesperado. Intenta de nuevo.", components: [] });
      else await interaction.reply({ content: "❌ Error inesperado. Intenta de nuevo.", flags: MessageFlags.Ephemeral });
    } catch { /* noop */ }
  }
});

client.login(config.discordToken);

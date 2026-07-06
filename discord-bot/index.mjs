// Bot de Discord de RaptorSquad.
// /vender abre un formulario: primero pide nombre/categoría/precio/cantidad
// (opciones del comando) y luego muestra DROPDOWNS (select menus) para elegir
// "Personajes asociados" (multi) y "Responsable del ítem" (uno solo), poblados
// en vivo con los usuarios de la app. Al confirmar, registra el ítem en estado
// EN_REGISTRO para que el Super Admin lo confirme desde la web.
//
// Discord limita cada menú a 25 opciones, así que los dropdowns soportan
// PAGINACIÓN (◀/▶) y BÚSQUEDA (🔎) para funcionar con cualquier cantidad de
// usuarios. Las selecciones se conservan aunque cambies de página o filtro.
import {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from "discord.js";
import { config } from "./config.mjs";

// Cuántos usuarios se muestran por página en cada menú. El menú de responsable
// añade además la opción "— Sin responsable —", por eso usamos 24 (24 + 1 = 25).
const PAGE_SIZE = 24;

// Estado en memoria de cada formulario /vender en curso, por sesión.
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

// Usuarios que pasan el filtro de búsqueda actual.
function filteredUsers(session) {
  const q = (session.filter || "").trim().toLowerCase();
  if (!q) return session.users;
  return session.users.filter((u) => u.name.toLowerCase().includes(q));
}

function pageInfo(session) {
  const filtered = filteredUsers(session);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(0, session.page || 0), totalPages - 1);
  const pageUsers = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  return { filtered, totalPages, page, pageUsers };
}

// Construye las filas de componentes (dropdowns + navegación + botones).
function buildComponents(sid, session) {
  const { filtered, totalPages, page, pageUsers } = pageInfo(session);
  session.page = page;

  const personajesOptions = pageUsers.length
    ? pageUsers.map((u) => ({
        label: u.name.slice(0, 100),
        value: String(u.id),
        default: session.selection.personajes.includes(String(u.id)),
      }))
    : [{ label: "(sin resultados)", value: "none" }];

  const personajesMenu = new StringSelectMenuBuilder()
    .setCustomId(`vender:personajes:${sid}`)
    .setPlaceholder("👥 Personajes asociados (uno o varios)")
    .setMinValues(0)
    .setMaxValues(Math.max(1, pageUsers.length))
    .setDisabled(pageUsers.length === 0)
    .addOptions(personajesOptions);

  const responsableOptions = [
    { label: "— Sin responsable —", value: "none", default: !session.selection.responsable },
    ...pageUsers.map((u) => ({
      label: u.name.slice(0, 100),
      value: String(u.id),
      default: session.selection.responsable === String(u.id),
    })),
  ];

  const responsableMenu = new StringSelectMenuBuilder()
    .setCustomId(`vender:responsable:${sid}`)
    .setPlaceholder("👤 Responsable del ítem (una sola persona)")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(responsableOptions);

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`vender:prev:${sid}`).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`vender:page:${sid}`).setLabel(`Pág ${page + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`vender:next:${sid}`).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId(`vender:search:${sid}`).setLabel(session.filter ? `🔎 "${session.filter}"` : "🔎 Buscar").setStyle(ButtonStyle.Primary),
  );

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`vender:confirm:${sid}`).setLabel("Registrar ítem").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`vender:cancel:${sid}`).setLabel("Cancelar").setStyle(ButtonStyle.Danger),
  );

  return [
    new ActionRowBuilder().addComponents(personajesMenu),
    new ActionRowBuilder().addComponents(responsableMenu),
    nav,
    actions,
  ];
}

function summaryText(session) {
  const nameById = new Map(session.users.map((u) => [String(u.id), u.name]));
  const personajes = session.selection.personajes.length
    ? session.selection.personajes.map((id) => nameById.get(id) || id).join(", ")
    : "(ninguno)";
  const responsable = session.selection.responsable
    ? nameById.get(session.selection.responsable) || session.selection.responsable
    : "(ninguno)";
  return [
    `📦 **${session.item.name}**`,
    `🏷️ Categoría: **${session.item.category}**`,
    `💰 Precio: **${session.item.price.toLocaleString("es-CL")}** adena`,
    `🔢 Cantidad: **${session.item.quantity}**`,
    ``,
    `👥 Personajes asociados: **${personajes}**`,
    `👤 Responsable: **${responsable}**`,
    ``,
    `Selecciona en los menús (usa ◀/▶ o 🔎 Buscar si hay muchos) y pulsa **Registrar ítem**. Quedará EN_REGISTRO (pendiente de confirmación).`,
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

      const sid = newSessionId();
      const session = {
        createdAt: Date.now(),
        ownerId: interaction.user.id,
        userTag: interaction.user.tag || interaction.user.id,
        item,
        users: usersRes.data.users || [],
        selection: { personajes: [], responsable: null },
        page: 0,
        filter: "",
      };
      sessions.set(sid, session);

      await interaction.editReply({ content: summaryText(session), components: buildComponents(sid, session) });
      return;
    }

    // 2) Modal de búsqueda enviado.
    if (interaction.isModalSubmit()) {
      const parts = interaction.customId.split(":");
      if (parts[0] !== "vender" || parts[1] !== "searchmodal") return;
      const sid = parts[2];
      const session = sessions.get(sid);
      if (!session) {
        await interaction.reply({ content: "⏱️ Este formulario expiró. Vuelve a ejecutar `/vender`.", flags: MessageFlags.Ephemeral });
        return;
      }
      session.filter = interaction.fields.getTextInputValue("filtro") || "";
      session.page = 0;
      await interaction.update({ content: summaryText(session), components: buildComponents(sid, session) });
      return;
    }

    // 3) Interacciones de componentes (dropdowns / botones) del formulario.
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

      // IDs visibles en la página actual (para fusionar selecciones sin perder
      // las de otras páginas).
      const { pageUsers } = pageInfo(session);
      const pageIds = new Set(pageUsers.map((u) => String(u.id)));

      if (kind === "personajes") {
        const chosen = interaction.values.filter((v) => v !== "none");
        const kept = session.selection.personajes.filter((id) => !pageIds.has(id));
        session.selection.personajes = [...kept, ...chosen];
        await interaction.update({ content: summaryText(session), components: buildComponents(sid, session) });
        return;
      }

      if (kind === "responsable") {
        const val = interaction.values[0];
        session.selection.responsable = val === "none" ? null : val;
        await interaction.update({ content: summaryText(session), components: buildComponents(sid, session) });
        return;
      }

      if (kind === "prev") {
        session.page = Math.max(0, (session.page || 0) - 1);
        await interaction.update({ content: summaryText(session), components: buildComponents(sid, session) });
        return;
      }

      if (kind === "next") {
        session.page = (session.page || 0) + 1;
        await interaction.update({ content: summaryText(session), components: buildComponents(sid, session) });
        return;
      }

      if (kind === "page") {
        await interaction.deferUpdate();
        return;
      }

      if (kind === "search") {
        const modal = new ModalBuilder()
          .setCustomId(`vender:searchmodal:${sid}`)
          .setTitle("Buscar usuario")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("filtro")
                .setLabel("Nombre (o parte) del personaje")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setValue(session.filter || "")
                .setPlaceholder("Deja vacío para ver todos"),
            ),
          );
        await interaction.showModal(modal);
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
        const nameById = new Map(session.users.map((u) => [String(u.id), u.name]));
        sessions.delete(sid);

        if (status === 200 && data?.ok) {
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
      else if (interaction.isRepliable()) await interaction.reply({ content: "❌ Error inesperado. Intenta de nuevo.", flags: MessageFlags.Ephemeral });
    } catch { /* noop */ }
  }
});

client.login(config.discordToken);

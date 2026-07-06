# RaptorSquad — Bot de Discord (prototipo)

Registra ítems en la web desde Discord con el comando `/vender`. El ítem queda
en estado **EN_REGISTRO** (borrador) y un **Super Admin** lo confirma desde la
web antes de que quede listo para venta.

## Cómo funciona

1. Un usuario ejecuta `/vender` en Discord y completa: nombre, categoría,
   precio, cantidad y (opcional) responsable.
2. El bot llama a `POST /api/bot/items` de la app, autenticándose con una
   **API key** (header `x-bot-api-key`).
3. El servidor valida los datos (misma validación que la web) y crea el ítem en
   estado `EN_REGISTRO`. Queda en la tabla de Inventario y en el Historial.
4. El Super Admin lo revisa y le da **Confirmar** en la web.

## Requisitos

- Node.js 18+ (usa `fetch` nativo).
- Un bot creado en el [Discord Developer Portal](https://discord.com/developers/applications).
- La variable `BOT_API_KEY` configurada en el **servidor** de la app, con el
  mismo valor que aquí.

## Setup

```bash
cd discord-bot
npm install
cp .env.example .env   # y completa los valores
npm run register       # registra el comando /vender en tu servidor de Discord
npm start              # arranca el bot
```

## Variables de entorno

| Variable            | Descripción                                                        |
|---------------------|--------------------------------------------------------------------|
| `DISCORD_BOT_TOKEN` | Token del bot (Portal → Bot → Reset Token)                         |
| `DISCORD_CLIENT_ID` | Application (Client) ID (Portal → General Information)             |
| `DISCORD_GUILD_ID`  | ID del servidor de Discord donde vive el bot                       |
| `API_BASE_URL`      | URL base de la app (DEV: túnel; PROD: https://raptorsquad.fly.dev) |
| `BOT_API_KEY`       | Misma API key que el servidor (`BOT_API_KEY`)                      |

## Notas del prototipo

- El **responsable** se vincula automáticamente si el nombre coincide (exacto,
  sin distinguir mayúsculas) con el nombre de personaje de un usuario. Si no
  coincide, el ítem se crea igual pero sin responsable vinculado.
- La **imagen** se asigna automáticamente si la categoría está mapeada en el
  catálogo; si no, el ítem aparece sin imagen hasta que se mapee (igual que al
  registrar desde la web).
- El bot solo **crea** ítems en EN_REGISTRO. La confirmación es siempre manual
  desde la web (Super Admin).

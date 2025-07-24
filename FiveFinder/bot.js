require('dotenv').config();
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType, PresenceUpdateStatus, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

const LOG_CHANNEL_ID = '1397522779108278322';
const BLACKLIST_ROLE_ID = '1397628595593023640';

let data = [];
try {
  const rawData = fs.readFileSync('./data.json', 'utf8');
  data = JSON.parse(rawData);
  console.log(`[INFO] Se cargaron ${data.length} entradas desde data.json`);
  console.log('[DEBUG] Primeros IDs cargados:', data.slice(0, 5).map(u => u.discord_id));
} catch (err) {
  console.error('[ERROR] No se pudo cargar data.json:', err);
  data = [];
}

let calipsoData = [];
try {
  const rawCalipso = fs.readFileSync('./calipso.json', 'utf8');
  calipsoData = JSON.parse(rawCalipso);
  console.log(`[INFO] Se cargaron ${calipsoData.length} entradas desde calipso.json`);
  console.log('[DEBUG] Primeros IDs cargados de calipso:', calipsoData.slice(0, 5).map(u => u.discord));
} catch (err) {
  console.error('[ERROR] No se pudo cargar calipso.json:', err);
  calipsoData = [];
}

let blacklist = [];
try {
  const rawBL = fs.readFileSync('./blacklist.json', 'utf8');
  const parsedBL = JSON.parse(rawBL);
  blacklist = parsedBL.blacklisted_users || [];
} catch (err) {
  console.error('No se pudo cargar blacklist.json, usando lista vacía.');
  blacklist = [];
}

const commands = [
  new SlashCommandBuilder()
    .setName('check')
    .setDescription('Busca información por discord_id')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID de Discord a buscar')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Gestiona la blacklist')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Añade un usuario a la blacklist')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID de Discord a añadir')
            .setRequired(true)
        ))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Quita un usuario de la blacklist')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID de Discord a eliminar')
            .setRequired(true)
        ))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Muestra la lista de usuarios blacklisteados')),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un usuario por ID con un motivo')
    .addStringOption(option =>
      option.setName('user_id')
        .setDescription('ID del usuario a banear')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Motivo del baneo')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbanea a un usuario por ID')
    .addStringOption(option =>
      option.setName('user_id')
        .setDescription('ID del usuario a desbanear')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  // Comando nuevo /ip
  new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra información sobre una dirección IP')
    .addStringOption(option =>
      option.setName('direccion')
        .setDescription('Dirección IP a consultar')
        .setRequired(true)
    ),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registrando comandos...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Comandos registrados correctamente.');
  } catch (error) {
    console.error(error);
  }
})();

client.on('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);

  async function actualizarEstado() {
    try {
      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if (!guild) return;

      await guild.members.fetch();

      const conectados = guild.members.cache.filter(member =>
        member.presence?.status !== PresenceUpdateStatus.Offline && !member.user.bot
      ).size;

      await client.user.setPresence({
        activities: [{
          name: `${conectados} usuarios conectados`,
          type: ActivityType.Watching
        }],
        status: 'online'
      });

    } catch (error) {
      console.error('Error actualizando estado:', error);
    }
  }

  actualizarEstado();
  setInterval(actualizarEstado, 60000);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (blacklist.includes(interaction.user.id)) {
    await interaction.reply({ content: '❌ Estás en la blacklist.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'check') {
    const id = interaction.options.getString('id');
    console.log(`[DEBUG] Buscando ID recibido: '${id}' (tipo: ${typeof id})`);

    let user = data.find(u => String(u.discord_id).trim() === String(id).trim());
    if (!user) {
      user = calipsoData.find(u => String(u.discord).trim() === String(id).trim());
    }

    console.log(`[DEBUG] Resultado de búsqueda:`, user ? 'Usuario encontrado' : 'No encontrado');

    const webhookURL = 'https://discord.com/api/webhooks/1397527464875393096/lP5kelRmeLALYbKa1wplodhUqiJNT7HW-Dp07N37jf647inbUdVdJ926uRXa50PFsXkR';

    const message = {
      username: 'FiveM Checker',
      embeds: [{
        title: 'Comando /check ejecutado',
        description: `**Usuario que ejecutó:** ${interaction.user.tag}\n**Discord ID buscado:** ${id}`,
        color: 65280,
        timestamp: new Date().toISOString()
      }]
    };

    fetch(webhookURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    }).catch(console.error);

    if (!user) {
      await interaction.reply({ content: `❌ No se encontró información para la ID ${id}`, ephemeral: true });
    } else {
      const file = new AttachmentBuilder('./Hola.png');

      const embed = new EmbedBuilder()
        .setTitle('Resultado')
        .setColor(0x000000)
        .addFields(
          { name: "'user'", value: `<@${id}> `, inline: false },
          { name: "'ip_adress'", value: user.ip || 'N/A', inline: false },
          { name: "'license'", value: user.license || 'No disponible', inline: false },
          { name: "'steam'", value: user.steam || 'No disponible', inline: false },
          { name: "'live'", value: 'No disponible', inline: false }
        )
        .setImage('attachment://Hola.png');

      try {
        await interaction.user.send({ embeds: [embed], files: [file] });

        await interaction.reply({
          content: '📬 Revisa tus mensajes directos para ver el resultado.',
          ephemeral: true
        });
      } catch (err) {
        await interaction.reply({
          content: '❌ No pude enviarte mensaje directo. Asegúrate de tenerlos habilitados.',
          ephemeral: true
        });
      }
    }
  }

  else if (interaction.commandName === 'ip') {
    const ipAddress = interaction.options.getString('direccion');
    console.log(`[DEBUG] Buscando info para IP: '${ipAddress}'`);

    // Buscar en data la IP
    const user = data.find(u => u.ip === ipAddress);

    if (!user) {
      await interaction.reply({ content: `❌ No se encontró información para la IP ${ipAddress}`, ephemeral: true });
      return;
    }

    try {
      const response = await fetch(`http://ip-api.com/json/${ipAddress}?lang=es`);
      const geo = await response.json();

      if (geo.status !== 'success') {
        await interaction.reply({ content: `❌ No se pudo obtener la ubicación para la IP ${ipAddress}`, ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Información para IP: ${ipAddress}`)
        .setColor(0x000000)
        .addFields(
          { name: 'Discord ID', value: user.discord_id || 'N/A', inline: true },
          { name: 'License', value: user.license || 'No disponible', inline: true },
          { name: 'Steam', value: user.steam || 'No disponible', inline: true },

          { name: 'País', value: geo.country || 'N/A', inline: true },
          { name: 'Región', value: geo.regionName || 'N/A', inline: true },
          { name: 'Ciudad', value: geo.city || 'N/A', inline: true },
          { name: 'ISP', value: geo.isp || 'N/A', inline: false },
          { name: 'Zona horaria', value: geo.timezone || 'N/A', inline: true },
          { name: 'Código postal', value: geo.zip || 'N/A', inline: true }
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      console.error('Error consultando API IP:', error);
      await interaction.reply({ content: `❌ Error al obtener la ubicación para la IP ${ipAddress}`, ephemeral: true });
    }
  }

  else if (interaction.commandName === 'blacklist') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.some(r => r.name === '👑')) {
      await interaction.reply({ content: '❌ No tienes permisos.', ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const id = interaction.options.getString('id');
      if (blacklist.includes(id)) {
        await interaction.reply({ content: 'Ya está en la blacklist.', ephemeral: true });
      } else {
        blacklist.push(id);
        fs.writeFileSync('./blacklist.json', JSON.stringify({ blacklisted_users: blacklist }, null, 2));

        // Intentar agregar el rol blacklist
        try {
          const guild = interaction.guild;
          const userMember = await guild.members.fetch(id).catch(() => null);
          if (userMember) {
            await userMember.roles.add(BLACKLIST_ROLE_ID);
          }
        } catch (error) {
          console.error('Error al asignar rol blacklist:', error);
        }

        await interaction.reply({ content: `✅ Usuario ${id} añadido a la blacklist y rol asignado (si está en el servidor).` });
      }
    }

    else if (subcommand === 'remove') {
      const id = interaction.options.getString('id');
      if (!blacklist.includes(id)) {
        await interaction.reply({ content: 'No está en la blacklist.', ephemeral: true });
      } else {
        blacklist = blacklist.filter(uid => uid !== id);
        fs.writeFileSync('./blacklist.json', JSON.stringify({ blacklisted_users: blacklist }, null, 2));

        // Intentar quitar el rol blacklist
        try {
          const guild = interaction.guild;
          const userMember = await guild.members.fetch(id).catch(() => null);
          if (userMember) {
            await userMember.roles.remove(BLACKLIST_ROLE_ID);
          }
        } catch (error) {
          console.error('Error al quitar rol blacklist:', error);
        }

        await interaction.reply({ content: `✅ Usuario ${id} eliminado de la blacklist y rol quitado (si está en el servidor).` });
      }
    }

    else if (subcommand === 'list') {
      if (blacklist.length === 0) {
        await interaction.reply({ content: '📭 La blacklist está vacía.' });
      } else {
        await interaction.reply({
          content: `📛 Lista de usuarios en blacklist:\n\`\`\`\n${blacklist.join('\n')}\n\`\`\``
        });
      }
    }
  }

  else if (interaction.commandName === 'ban') {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason');
    const guild = interaction.guild;

    const member = await guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionFlagsBits.BanMembers) && !member.roles.cache.some(r => r.name === '👑')) {
      await interaction.reply({ content: '❌ No tienes permisos para banear usuarios.', ephemeral: true });
      return;
    }

    try {
      const user = await client.users.fetch(userId);
      await guild.members.ban(user, { reason });

      await interaction.reply({ content: `✅ Usuario ${user.tag} ha sido baneado. Motivo: ${reason}`, ephemeral: true });

      const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send(`🚨 El usuario **${user.tag}** (\`${user.id}\`) fue **baneado** por ${interaction.user}.\n📝 Motivo: \`${reason}\``);
      }
    } catch (error) {
      console.error('Error baneando usuario:', error);
      await interaction.reply({ content: '❌ No se pudo banear al usuario. Puede que no exista o no esté en el servidor.', ephemeral: true });
    }
  }

  else if (interaction.commandName === 'unban') {
    const userId = interaction.options.getString('user_id');
    const guild = interaction.guild;

    const member = await guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionFlagsBits.BanMembers) && !member.roles.cache.some(r => r.name === '👑')) {
      await interaction.reply({ content: '❌ No tienes permisos para desbanear usuarios.', ephemeral: true });
      return;
    }

    try {
      await guild.members.unban(userId);
      await interaction.reply({ content: `✅ Usuario con ID ${userId} ha sido desbaneado.`, ephemeral: true });

      const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send(`✅ El usuario con ID \`${userId}\` fue **desbaneado** por ${interaction.user}.`);
      }
    } catch (error) {
      console.error('Error desbaneando usuario:', error);
      await interaction.reply({ content: '❌ No se pudo desbanear al usuario. Puede que no exista o no esté baneado.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

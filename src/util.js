const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const COLOR = 0x5865f2;

function fill(text, vars = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function memberVars(member, extra = {}) {
  return {
    user: `<@${member.id}>`,
    username: member.user?.username ?? member.displayName,
    server: member.guild.name,
    count: member.guild.memberCount,
    ...extra,
  };
}

function embed(title, description, color = COLOR) {
  const e = new EmbedBuilder().setColor(color);
  if (title) e.setTitle(title);
  if (description) e.setDescription(String(description).slice(0, 4000));
  return e;
}

function hasAnyRole(member, roleIds = []) {
  return roleIds.some((r) => r && member.roles.cache.has(r));
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

async function sendTo(guild, channelId, payload) {
  if (!channelId) return null;
  const ch = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!ch || !ch.isTextBased()) return null;
  return ch.send(payload).catch((e) => { console.warn('[send]', e.message); return null; });
}

function parseDuration(str) {
  const m = String(str).trim().match(/^(\d+)\s*(s|m|h|d|w)?$/i);
  if (!m) return null;
  const mult = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[(m[2] || 'm').toLowerCase()];
  return Number(m[1]) * mult;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { COLOR, fill, memberVars, embed, hasAnyRole, isAdmin, sendTo, parseDuration, escapeHtml };

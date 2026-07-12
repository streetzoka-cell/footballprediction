const env = require('../config/env');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const LEVELS = {
  error: { color: COLORS.red, label: 'ERROR' },
  warn:  { color: COLORS.yellow, label: 'WARN ' },
  info:  { color: COLORS.green, label: 'INFO ' },
  debug: { color: COLORS.cyan, label: 'DEBUG' },
};

function formatMsg(level, message) {
  const ts = new Date().toISOString();
  const lvl = LEVELS[level] || LEVELS.info;

  if (env.isDev) {
    return `${COLORS.gray}${ts}${COLORS.reset} ${lvl.color}[${lvl.label}]${COLORS.reset} ${message}`;
  }
  return `${ts} [${lvl.label.trim()}] ${message}`;
}

module.exports = {
  error: (msg) => console.error(formatMsg('error', msg)),
  warn:  (msg) => console.warn(formatMsg('warn', msg)),
  info:  (msg) => console.log(formatMsg('info', msg)),
  debug: (msg) => { if (env.isDev) console.log(formatMsg('debug', msg)); },
};

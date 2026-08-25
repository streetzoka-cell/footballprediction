module.exports = {
  apps: [

    {
      name: 'zokascore-backend-v1',
      script: 'src/index.js',
      cwd: 'C:/Dev/Apk/footballprediction/backend-v1',

      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      watch: false,

      max_memory_restart: '768M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,

      env: {
        NODE_ENV: 'production'
      },

      error_file: './logs/error.log',
      out_file: './logs/output.log',
      merge_logs: true,
      time: true
    },

    {
      name: 'zokascore-cloudflared',
      script: 'C:/Program Files (x86)/cloudflared/cloudflared.exe',
      args: 'tunnel run zokascore-api',
      cwd: 'C:/Dev/Apk/footballprediction/backend-v1',

      interpreter: 'none',

      autorestart: true,
      watch: false,

      min_uptime: '10s',
      max_restarts: 20,
      restart_delay: 5000,

      error_file: './logs/cloudflared-error.log',
      out_file: './logs/cloudflared-output.log',
      merge_logs: true,
      time: true
    }

  ]
};

module.exports = {
  apps: [
    {
      name: 'zokascore-backend-v1',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/error.log',
      out_file: './logs/output.log',
      merge_logs: true,
      time: true,
    },
  ],
};
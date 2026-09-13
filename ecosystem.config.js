module.exports = {
  apps: [
    {
      name: 'rnkstudios-site',
      script: '/home/rnk/rnkstudios-site/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: '3003',
        RNK_API_PORT: '3001'
      },
      error_file: '/home/rnk/.pm2/logs/rnkstudios-site-error.log',
      out_file: '/home/rnk/.pm2/logs/rnkstudios-site-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};

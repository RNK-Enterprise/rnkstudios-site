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
        // 3003 was taken over by rnk-enterprise-website; the static+proxy
        // server runs alongside it here until a slot is decided for it.
        PORT: '3013',
        RNK_API_PORT: '3001'
      },
      error_file: '/home/rnk/.pm2/logs/rnkstudios-site-error.log',
      out_file: '/home/rnk/.pm2/logs/rnkstudios-site-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};

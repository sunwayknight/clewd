module.exports = {
  apps: [{
    name: 'clewd',
    script: 'clewd.js',
    watch: false,
    restart_delay: 0,
    max_restarts: 5,  // -1 表示无限重启
    autorestart: true
  }]
}
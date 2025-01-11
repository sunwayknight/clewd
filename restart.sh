#!/bin/bash

# 设置 Git 以远程仓库为准
git fetch --all
git reset --hard origin/master
npm install --no-audit --fund false
chown -R $(whoami) lib/bin/*
chmod u+x lib/bin/*
chmod -R 777 $(pwd)
node clewd.js
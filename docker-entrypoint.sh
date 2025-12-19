#!/bin/sh

echo "🧹 Cleaning auth folder for fresh session..."
rm -rf /app/auth/* 2>/dev/null || true

echo "🚀 Starting ChatBot..."
exec node server.js

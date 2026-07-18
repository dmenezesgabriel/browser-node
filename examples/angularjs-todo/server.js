'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 3000
const PUBLIC = path.join(__dirname, 'public')
const ANGULAR = path.join(__dirname, 'node_modules', 'angular', 'angular.js')

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
}

const server = http.createServer(function (req, res) {
  let filePath
  if (req.url === '/angular.js') {
    filePath = ANGULAR
  } else {
    const urlPath = req.url === '/' ? '/index.html' : req.url
    filePath = path.join(PUBLIC, urlPath)
  }
  const ext = path.extname(filePath)
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' })
    res.end(content)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }
})

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, function () {
    console.log('AngularJS Todo server on http://localhost:' + PORT)
  })
}

module.exports = { server }

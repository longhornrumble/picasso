const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  console.log('Request for:', req.url);
  
  let filePath = '';
  
  if (req.url === '/' || req.url === '/test') {
    filePath = path.join(__dirname, 'test-streaming-surgery.html');
  } else if (req.url.startsWith('/public/')) {
    filePath = path.join(__dirname, req.url);
  } else if (req.url === '/test-streaming-surgery.html') {
    filePath = path.join(__dirname, 'test-streaming-surgery.html');
  } else {
    filePath = path.join(__dirname, 'public', req.url);
  }
  
  const extname = path.extname(filePath);
  let contentType = 'text/html';
  
  switch (extname) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.json':
      contentType = 'application/json';
      break;
  }
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.log('Error loading:', filePath, err.code);
      res.writeHead(404);
      res.end('File not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const PORT = 3002;
server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}/`);
  console.log(`Open http://localhost:${PORT}/test to view the test page`);
});
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const types = {'': 'text/html', '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript',
  '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json'};
const port = Number(process.env.LANDPAY_PORT || 4173);
createServer(async (request,response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    const asset = path === '/landpay/' ? 'index.html' : /^\/landpay\/([\w.-]+)$/.exec(path)?.[1];
    if (!asset || !types[extname(asset)]) throw Error('Unknown asset.');
    const contents = await readFile(new URL('../docs/' + asset, import.meta.url));
    response.writeHead(200, {'Content-Type':types[extname(asset)], 'Cache-Control':'no-store'});
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log('LandPay preview at http://127.0.0.1:' + port + '/landpay/'));


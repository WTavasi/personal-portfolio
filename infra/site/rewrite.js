// CloudFront Function (viewer request): pages are stored as <path>/index.html, so a request
// for /resume or /resume/ is served from /resume/index.html. Files with an extension
// (/assets/app.js, /404.html) pass through unchanged.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.split('/').pop().indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}

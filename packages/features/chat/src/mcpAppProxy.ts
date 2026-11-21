const VIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "media-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "worker-src 'none'",
].join("; ");

export const PROXY = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'none'; object-src 'none'"><style>html,body{margin:0;width:100%;height:100%}iframe{width:100%;height:100%;border:0}</style></head><body><script>
let view;
window.addEventListener('message', event => {
  if (event.source === window.parent) {
    const data = event.data;
    if (data === '__terminus_start') {
      window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/sandbox-proxy-ready',params:{}}, '*');
    } else if (data?.method === 'ui/notifications/sandbox-resource-ready') {
      if (view) view.remove();
      view = document.createElement('iframe');
      view.setAttribute('sandbox', 'allow-scripts');
      const policy = ${JSON.stringify(VIEW_CSP)};
      view.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '"></head><body>' + data.params.html + '</body></html>';
      document.body.appendChild(view);
    } else if (view && data?.jsonrpc === '2.0') {
      view.contentWindow.postMessage(data, '*');
    }
  } else if (view && event.source === view.contentWindow && event.data?.jsonrpc === '2.0') {
    window.parent.postMessage(event.data, '*');
  }
});
</script></body></html>`;

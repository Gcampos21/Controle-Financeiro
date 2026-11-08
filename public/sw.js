/* Guarda os arquivos do app no celular para ele abrir mesmo sem internet.
   Os DADOS não passam por aqui: quem cuida deles é o cache do Firestore.
   Ao publicar uma versão nova, aumente o número abaixo. */

const VERSAO = "cf-v4";
const ARQUIVOS = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/app.js", "js/config.js", "js/firebase.js", "js/util.js", "js/dados.js", "js/formularios.js", "js/telas.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  // cache: "reload" = baixa do servidor, sem usar a cópia velha do navegador
  e.waitUntil(caches.open(VERSAO)
    .then(c => c.addAll(ARQUIVOS.map(u => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(chaves => Promise.all(chaves.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Arquivos do app: tenta a internet primeiro (pega atualizações), se falhar usa a cópia.
  // cache: "no-cache" = confere com o servidor em vez de usar a cópia do navegador (que pode ter até 1 h)
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" })
        .then(r => {
          if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); }
          return r;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
    );
    return;
  }

  // Biblioteca do Firebase e fontes: usa a cópia e atualiza por trás
  if (url.hostname === "www.gstatic.com" || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(VERSAO).then(async c => {
      const guardado = await c.match(e.request);
      const rede = fetch(e.request).then(r => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; }).catch(() => guardado);
      return guardado || rede;
    }));
  }
  // Todo o resto (banco de dados, login) vai direto para a internet
});

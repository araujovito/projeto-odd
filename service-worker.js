const CACHE = "odd-clara-interface-v1";
const ARQUIVOS = ["/", "/manifest.webmanifest", "/icone.svg"];

self.addEventListener("install", function (evento) {
  evento.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(ARQUIVOS); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (evento) {
  evento.waitUntil(caches.keys().then(function (chaves) {
    return Promise.all(chaves.filter(function (chave) { return chave !== CACHE; }).map(function (chave) {
      return caches.delete(chave);
    }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (evento) {
  if (evento.request.method !== "GET" || new URL(evento.request.url).pathname.startsWith("/api/")) return;
  evento.respondWith(fetch(evento.request).then(function (resposta) {
    const copia = resposta.clone();
    caches.open(CACHE).then(function (cache) { cache.put(evento.request, copia); });
    return resposta;
  }).catch(function () { return caches.match(evento.request).then(function (resposta) { return resposta || caches.match("/"); }); }));
});

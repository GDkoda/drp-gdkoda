/* Service worker mínimo: permite a experiência instalável sem manter assets antigos em cache.
   A aplicação continua buscando seus recursos normalmente na rede. */
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

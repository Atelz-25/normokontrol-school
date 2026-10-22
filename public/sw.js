// Офлайн-режим (бриф, этап 5). Сохраняем в кэш браузера только файлы самого сайта:
// страницу, скрипты, стили, иконку. Работы пользователя сюда не попадают — они вообще
// никуда не отправляются и разбираются в памяти.
//
// Стратегия «сначала сеть»: при подключении берём свежую версию сайта и обновляем кэш,
// без сети отдаём сохранённую копию.
const CACHE = 'normokontrol-v1';
const START = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(START)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Старые версии кэша удаляем и сразу начинаем обслуживать открытые страницы.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Только свои файлы и только чтение: чужие адреса не трогаем (их и нет).
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('./index.html'))),
  );
});

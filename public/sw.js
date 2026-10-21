self.addEventListener('push', (event) => {
  let data = { title: 'ANDARY SHOP', body: '' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // ignore malformed payloads
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.jpg',
      badge: '/favicon.jpg',
      data: { notificationId: data.notificationId },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
    })
  )
})

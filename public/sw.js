// brunner_prefs DB를 열되 muted_rooms 저장소를 항상 보장한다.
// (예전엔 saveLastPushTime이 저장소를 만들지 않아, 이게 먼저 열리면 저장소가 없어 "마지막 알림 수신"이
//  실제로 푸시가 와도 계속 '수신 없음'으로 뜨는 오진단을 유발했다.)
const openPrefsDB = () =>
  new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open("brunner_prefs", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("muted_rooms")) db.createObjectStore("muted_rooms", { keyPath: "key" });
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    } catch (err) { reject(err); }
  });

const getMutedRooms = () =>
  new Promise((resolve) => {
    openPrefsDB().then((db) => {
      try {
        const tx = db.transaction("muted_rooms", "readonly");
        const get = tx.objectStore("muted_rooms").get("list");
        get.onsuccess = (e) => resolve(new Set((e.target.result?.value || []).map(String)));
        get.onerror = () => resolve(new Set());
      } catch { resolve(new Set()); }
    }).catch(() => resolve(new Set()));
  });

const saveLastPushTime = () => {
  openPrefsDB().then((db) => {
    try {
      const tx = db.transaction("muted_rooms", "readwrite");
      tx.objectStore("muted_rooms").put({ key: "last_push_time", value: Date.now() });
    } catch {}
  }).catch(() => {});
};

const sendPushReceipt = (payload) => {
  try {
    return fetch("/api/push-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    return Promise.resolve();
  }
};

// 새 SW 버전 감지 즉시 활성화 (앱 재시작 없이 적용)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
// Chrome은 설치 가능 판정에 fetch 핸들러의 존재를 본다 — 없으면 "홈 화면에 추가"가
// 아예 제안되지 않는다. respondWith를 부르지 않으므로 요청은 평소대로 네트워크로 나간다.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || "Brunner";
  const unreadCount = data.badge || 0;
  const targetUrl = data.url || "/";
  const roomId = data.roomId ? String(data.roomId) : null;
  const forceNotification = data.forceNotification === true;

  const handlePush = async () => {
    const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });

    // 앱 배지 업데이트: Web API 지원 시 직접, 아니면 앱 창에 postMessage로 위임
    if (unreadCount > 0) {
      if (navigator.setAppBadge) {
        await navigator.setAppBadge(unreadCount).catch(() => {});
      } else {
        for (const client of clientList) {
          client.postMessage({ type: "SET_BADGE", count: unreadCount });
        }
      }
    }

    // 마지막 푸시 수신 시각 저장
    saveLastPushTime();

    // 포커스된 탭이 있으면 알림 표시 억제, 사운드만 재생 요청
    const hasVisibleFocusedClient = clientList.some(
      (c) => c.focused && c.visibilityState === "visible",
    );
    if (hasVisibleFocusedClient && !forceNotification) {
      if (data.sound) {
        for (const client of clientList) {
          client.postMessage({ type: "PLAY_SOUND", sound: data.sound });
        }
      }
      sendPushReceipt({ phase: "suppressed", roomId, title });
      return;
    }

    // 음소거된 방은 소리/진동 없이 표시
    const mutedRooms = await getMutedRooms();
    const isMuted = roomId ? mutedRooms.has(roomId) : false;

    const isSilent = isMuted || data.silent === true || data.sound === "silent";
    const options = {
      body: data.body || "",
      icon: "/pwa-icon-192.png",
      badge: "/pwa-icon-192.png",
      data: {
        url: targetUrl,
        unreadCount,
        sound: data.sound || "default",
        scheduleType: data.scheduleType || null,
        inviteData: data.inviteId ? {
          inviteId: data.inviteId,
          roomId: data.roomId,
          roomName: data.roomName,
          inviterId: data.inviterId,
          inviterName: data.inviterName,
        } : null,
      },
      vibrate: isSilent ? [] : [200, 100, 200],
      silent: isSilent,
      requireInteraction: false,
    };
    await Promise.all([
      self.registration.showNotification(title, options),
      sendPushReceipt({ phase: "shown", roomId, title }),
    ]);
  };

  event.waitUntil(handlePush());
});

// 구독 회전 처리 — iOS 등에서 푸시 구독이 주기적으로 무효화/회전될 때 발생한다.
// 이 이벤트를 처리해 재구독 + 서버 갱신을 하지 않으면 해당 기기는 조용히 푸시가 영영 끊긴다
// (앱을 다시 열 때까지 복구 안 됨). 옛 endpoint를 함께 보내 서버가 소유자를 찾아 이관한다.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const oldEndpoint = event.oldSubscription?.endpoint || null;
      let sub = event.newSubscription || null;
      if (!sub) {
        const appServerKey = event.oldSubscription?.options?.applicationServerKey;
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey || undefined,
        });
      }
      if (!sub) return;
      await fetch("/api/push", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldEndpoint, subscription: sub.toJSON() }),
      });
    } catch (e) {
      // 재구독 실패는 다음 앱 실행 시 클라이언트가 재등록하며 복구된다.
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  const inviteData = event.notification.data?.inviteData;

  // 알림 클릭 시 앱 배지 초기화
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }

  // 초대 데이터는 URL 파라미터로 전달 — navigate로 페이지가 리로드되면
  // postMessage가 유실되므로 마운트 시 파라미터 파싱으로 모달을 띄운다
  let openUrl = url;
  if (inviteData?.inviteId) {
    const params = new URLSearchParams({
      inviteId: String(inviteData.inviteId),
      roomId: String(inviteData.roomId || ""),
      roomName: String(inviteData.roomName || ""),
      inviterId: String(inviteData.inviterId || ""),
      inviterName: String(inviteData.inviterName || ""),
    });
    openUrl = `${url}?${params}`;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        const client = clientList[0];
        // 이미 같은 경로면 navigate 생략 (Android WebView 리로드 방지)
        // — 이 경우 리로드가 없어 postMessage로 초대 모달 표시 가능
        try {
          const clientPath = new URL(client.url).pathname;
          const targetPath = new URL(url, client.url).pathname;
          if (clientPath !== targetPath && "navigate" in client) client.navigate(openUrl);
        } catch {
          if ("navigate" in client) client.navigate(openUrl);
        }
        const sound = event.notification.data?.sound;
        for (const c of clientList) {
          c.postMessage({ type: "NOTIFICATION_CLICK", url, inviteData });
          if (sound) c.postMessage({ type: "PLAY_SOUND", sound });
        }
        return client.focus();
      }
      // 앱이 닫혀있을 때
      if (clients.openWindow) return clients.openWindow(openUrl);
    }),
  );
});

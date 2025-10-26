// background.js - service worker
const GMAIL_API_BASE = 'https://www.googleapis.com/gmail/v1';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

function getGoogleToken(interactive=true) {
  return new Promise((resolve, reject) => {
    try {
      chrome.identity.getAuthToken({interactive}, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError || new Error('No token'));
          return;
        }
        resolve(token);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function fetchJson(url, token, opts={}) {
  const headers = Object.assign({}, opts.headers || {}, {'Authorization': 'Bearer ' + token});
  const resp = await fetch(url, Object.assign({}, opts, {headers}));
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error('HTTP ' + resp.status + ' - ' + t);
  }
  return await resp.json();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'getLastFiveUnread') {
        const token = await getGoogleToken(true);
        const messagesResp = await fetchJson(`${GMAIL_API_BASE}/users/me/messages?q=is:unread&maxResults=5`, token);
        const messages = messagesResp.messages || [];
        const detailed = [];
        for (const m of messages) {
          const mdata = await fetchJson(`${GMAIL_API_BASE}/users/me/messages/${m.id}?format=full`, token);
          detailed.push(mdata);
        }
        sendResponse({ok: true, messages: detailed});
      } else if (msg.type === 'createCalendarEvent') {
        const token = await getGoogleToken(true);
        const event = msg.event;
        const created = await fetchJson(`${CALENDAR_API_BASE}/calendars/primary/events`, token, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(event)
        });
        sendResponse({ok: true, event: created});
      } else if (msg.type === 'markRead') {
        const token = await getGoogleToken(true);
        const resp = await fetchJson(`${GMAIL_API_BASE}/users/me/messages/${msg.id}/modify`, token, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({removeLabelIds: ['UNREAD']})
        });
        sendResponse({ok: true, result: resp});
      } else {
        sendResponse({ok:false, error:'unknown message type'});
      }
    } catch (err) {
      sendResponse({ok:false, error: err.message});
    }
  })();
  return true;
});


// popup.js - main UI logic
document.addEventListener('DOMContentLoaded', () => {
  const authBtn = document.getElementById('authAndFetch');
  const refreshBtn = document.getElementById('refresh');
  const optionsLink = document.getElementById('optionsLink');
  const darkModeToggle = document.getElementById('darkModeToggle'); // NEW: Get the toggle element

  // NEW: Load dark mode preference when the pop-up opens
  loadDarkModePreference();

  authBtn.addEventListener('click', fetchAndProcess);
  refreshBtn.addEventListener('click', fetchAndProcess);

  // NEW: Add listener for the dark mode toggle
  if (darkModeToggle) {
    darkModeToggle.addEventListener('change', handleDarkModeToggle);
  }

  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

/**
 * Loads the saved dark mode preference from storage and applies it.
 */
function loadDarkModePreference() {
  const body = document.body;
  const darkModeToggle = document.getElementById('darkModeToggle');

  // Use chrome.storage.local for extensions
  chrome.storage.local.get(['darkMode'], (result) => {
    if (result.darkMode === true) {
      body.classList.add('dark-mode');
      if (darkModeToggle) {
        darkModeToggle.checked = true;
      }
    }
  });
}

/**
 * Handles the dark mode toggle event, applies/removes the class, and saves the preference.
 */
function handleDarkModeToggle() {
  const body = document.body;
  const darkModeToggle = document.getElementById('darkModeToggle');
  const isChecked = darkModeToggle.checked;

  if (isChecked) {
    body.classList.add('dark-mode');
  } else {
    body.classList.remove('dark-mode');
  }

  // Save the new preference to storage
  chrome.storage.local.set({ darkMode: isChecked });
}

async function fetchAndProcess() {
  setStatus('Requesting unread mails...');
  const resp = await sendToBackground({type:'getLastFiveUnread'});
  if (!resp.ok) {
    setStatus('Error: ' + (resp.error || 'unknown'));
    return;
  }
  const mails = resp.messages || [];
  if (mails.length === 0) {
    setStatus('No unread mails found.');
    return;
  }
  setStatus('Fetched ' + mails.length + ' mails. Summarizing...');
  const items = mails.map(parseMessage);
  renderMails(items);
  const summaries = await summarizeWithHuggingFace(items);
  for (let i=0;i<items.length;i++) {
    const el = document.getElementById('mail-'+i);
    if (!el) continue;
    const smEl = el.querySelector('.summary');
    smEl.innerText = summaries[i] || '(no summary)';
    const suggestions = extractDeadlineCandidates(summaries[i] + "\n\n" + items[i].body + "\n\n" + items[i].snippet);
    renderSuggestions(el, suggestions, items[i], summaries[i]);
    const markBtn = el.querySelector('.markReadBtn');
    markBtn.addEventListener('click', async () => {
      const mId = items[i].id;
      const r = await sendToBackground({type:'markRead', id: mId});
      if (r.ok) {
        markBtn.disabled = true;
        markBtn.innerText = 'Marked';
      } else {
        alert('Failed to mark read: ' + (r.error||''));
      }
    });
  }
  setStatus('Done.');
}

function setStatus(t){ const s = document.getElementById('status'); if (s) s.innerText = t; }

function parseMessage(m) {
  const headers = {};
  const parts = m.payload?.headers || [];
  for (const h of parts) headers[h.name.toLowerCase()] = h.value;
  return {
    id: m.id,
    threadId: m.threadId,
    from: headers['from'] || '',
    to: headers['to'] || '',
    subject: headers['subject'] || '',
    date: headers['date'] || '',
    snippet: m.snippet || '',
    body: getBodyFromPayload(m.payload)
  };
}

function getBodyFromPayload(payload) {
  if (!payload) return '';
  const mimeType = payload.mimeType || '';
  if (mimeType === 'text/plain' && payload.body && payload.body.data) {
    try {
      return atob(payload.body.data.replace(/-/g,'+').replace(/_/g,'/'));
    } catch (e) {
      return '';
    }
  }
  if (payload.parts) {
    for (const p of payload.parts) {
      if (p.mimeType === 'text/plain' && p.body && p.body.data) {
        try {
          return atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/'));
        } catch (e) {
          return '';
        }
      }
    }
  }
  return '';
}

function renderMails(items) {
  const container = document.getElementById('mails');
  container.innerHTML = '';
  items.forEach((it, idx) => {
    const div = document.createElement('div');
    div.className = 'mail';
    div.id = 'mail-'+idx;
    div.innerHTML = '<div class="meta"><strong>' + escapeHtml(it.subject||'(no subject)') + '</strong> — ' + escapeHtml(it.from) +
      '<br><small class="small">' + escapeHtml(it.date) + '</small></div>' +
      '<div class="summary">Summarizing...</div>' +
      '<div class="suggestions"><em class="muted">Looking for deadlines...</em></div>' +
      '<div class="actions">' +
      '<button class="markReadBtn">Mark read</button>' +
      '</div>';
    container.appendChild(div);

    setTimeout(()=> {
      /*const addBtn = div.querySelector('.addEventBtn');
      addBtn.addEventListener('click', async () => {
        const title = prompt('Event title (suggested):', div.querySelector('.summary').innerText.split('\n')[0] || it.snippet.slice(0,80));
        if (!title) return;
        const when = prompt('Enter date/time for deadline in ISO format (YYYY-MM-DDTHH:MM). Example: 2025-10-31T17:00', '');
        if (!when) return;
        const event = {
          summary: title,
          description: it.snippet + "\\n\\nSummary:\\n" + div.querySelector('.summary').innerText,
          start: { dateTime: when },
          end: { dateTime: when }
        };
        const r = await sendToBackground({type:'createCalendarEvent', event});
        if (r.ok) {
          alert('Event created: ' + (r.event.htmlLink || 'created'));
        } else {
          alert('Failed to create event: ' + (r.error||''));
        }
      });*/
    }, 20);
  });
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function sendToBackground(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      resolve(resp || {ok:false, error: chrome.runtime.lastError && chrome.runtime.lastError.message});
    });
  });
}

async function summarizeWithHuggingFace(items) {
  const opts = await new Promise(res => chrome.storage.sync.get(['HF_API_KEY', 'HF_MODEL'], res));
  const HF_API_KEY = opts.HF_API_KEY || '';
  const HF_MODEL = opts.HF_MODEL || 'facebook/bart-large-cnn';

  if (!HF_API_KEY) {
    alert('Hugging Face API key not set. Open extension options to add it.');
    return items.map(() => '(no API key)');
  }

  // 🔍 Detect if the model understands instructions
  const lowerModel = HF_MODEL.toLowerCase();
  const isInstructionModel =
    lowerModel.includes('flan') ||
    lowerModel.includes('instruct') ||
    lowerModel.includes('mistral') ||
    lowerModel.includes('llama') ||
    lowerModel.includes('command') ||
    lowerModel.includes('chat');

  const summaries = [];

  for (const it of items) {
    // ✨ Choose prompt format automatically
    const input = isInstructionModel
      ? `Summarize this email in 2–3 short sentences focusing on key actions, important information, and any deadlines or events mentioned.

Subject: ${it.subject}
From: ${it.from}
Date: ${it.date}
Body: ${it.body || it.snippet}`
      : `${it.subject}
From: ${it.from}
Date: ${it.date}

${it.body || it.snippet}`;

    try {
      const resp = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + HF_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: input })
      });

      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();

      // 🧩 Handle all response shapes
      let text = '';
      if (Array.isArray(data)) {
        if (data[0]?.summary_text) text = data[0].summary_text;
        else if (data[0]?.generated_text) text = data[0].generated_text;
        else if (typeof data[0] === 'string') text = data[0];
        else text = JSON.stringify(data[0]);
      } else if (typeof data === 'string') {
        text = data;
      } else if (data.generated_text) {
        text = data.generated_text;
      } else if (data.error) {
        text = `(error: ${data.error})`;
      }

      summaries.push(text.trim() || '(no summary)');
    } catch (err) {
      console.error(err);
      summaries.push('(error summarizing)');
    }
  }

  return summaries;
}
// Deadline detection heuristics
function extractDeadlineCandidates(text) {
  if (!text) return [];
  const candidates = new Set();
  const isoRe = /\b(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2})\b/g;
  let m;
  while ((m = isoRe.exec(text)) !== null) candidates.add(m[1]);
  const ymd = /\b(20\d{2}-\d{1,2}-\d{1,2})\b/g;
  while ((m = ymd.exec(text)) !== null) candidates.add(m[1]);
  const dmy = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]20\d{2})\b/g;
  while ((m = dmy.exec(text)) !== null) candidates.add(m[1]);
  const monthRe = /\b(\d{1,2}(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s*20\d{2})?)\b/ig;
  while ((m = monthRe.exec(text)) !== null) candidates.add(m[0]);
  const monthRe2 = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(20\d{2}))?\b/ig;
  while ((m = monthRe2.exec(text)) !== null) candidates.add(m[0]);
  const timeRe = /\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\b/g;
  while ((m = timeRe.exec(text)) !== null) candidates.add(m[1]);
  const timeRe2 = /\b(\d{1,2}\s*(?:AM|PM|am|pm))\b/g;
  while ((m = timeRe2.exec(text)) !== null) candidates.add(m[1]);
  // Smarter relative date detection
const rel = text.match(
  /\b(tomorrow|today|this (?:week|month)|next (?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|by\s+(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/ig
);
if (rel) rel.forEach(r => candidates.add(r));

  return Array.from(candidates).slice(0,6);
}

function renderSuggestions(containerEl, suggestions, mailItem, summary) {
  const node = containerEl.querySelector('.suggestions');
  node.innerHTML = '';

  const list = document.createElement('div');

  suggestions.forEach(s => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.innerText = s;
    div.title = 'Click to view context for this date';

    div.addEventListener('click', () => {
      // Find what this date likely refers to
      const lowerSummary = (summary + ' ' + mailItem.body + ' ' + mailItem.snippet).toLowerCase();

      // Create a few words of context around the date
      const idx = lowerSummary.indexOf(s.toLowerCase());
      let context = '';
      if (idx !== -1) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(lowerSummary.length, idx + s.length + 60);
        context = lowerSummary.slice(start, end);
      } else {
        context = lowerSummary.slice(0, 160);
      }

      // Clean and format for readability
      context = context.replace(/\s+/g, ' ').trim();
      const message = `📅 ${s}\n\nContext:\n${context || '(no additional context found)'}`;

      alert(message);
    });

    list.appendChild(div);
  });

  node.appendChild(list);
}

function pad(n) { return (n+'').padStart(2,'0'); }
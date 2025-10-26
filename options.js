/* options.js - handles saving/clearing OpenAI key and model */
document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('save');
  const clearBtn = document.getElementById('clear');
  const openaiInput = document.getElementById('hf');
  const modelInput = document.getElementById('model');
  const msg = document.getElementById('msg');

  saveBtn.addEventListener('click', ()=> {
    const k = openaiInput.value.trim();
    const m = modelInput.value.trim();
    chrome.storage.sync.set({HF_API_KEY: k, HF_MODEL: m}, ()=> {
      msg.innerText = 'Saved.';
      msg.style.color = 'green';
    });
  });

  clearBtn.addEventListener('click', ()=> {
    chrome.storage.sync.remove(['HF_API_KEY','HF_MODEL'], ()=> {
      openaiInput.value = '';
      msg.innerText = 'Cleared.';
      msg.style.color = 'green';
    });
  });

  // load existing values
  chrome.storage.sync.get(['HF_API_KEY','HF_MODEL'], (res) => {
    openaiInput.value = res.HF_API_KEY || '';
    modelInput.value = res.HF_MODEL || 'facebook/bart-large-cnn';
  });
});

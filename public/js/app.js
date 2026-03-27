import { DuckViewer } from "/js/duck_viewer.js";
const PRELOADED_DUCK = window.PRELOADED_DUCK || null;
const SINGLE_DUCK_MODE = window.SINGLE_DUCK_MODE || false;
const viewer = new DuckViewer(document.getElementById("ThreeDuck"));
const duckSelect = document.getElementById("duckSelect");
const STAT_MULTIPLIER = 10;
const startChatBtn = document.getElementById("startChatButton");
const chatToggle = document.getElementById("chatToggle");
const chatCollapse = document.getElementById("chatCollapse");
const chatChevron = chatToggle.querySelector(".duck-chat-chevron");
const duckReadyName = document.getElementById("duckReadyName");
let conversation = [];
const chatBody = document.getElementById("chatBody");
const chatForm = document.getElementById("chat_form");
const chatInput = document.getElementById("chat_input");
const chatMessages = document.getElementById("chat_messages");
let activeDuck;
if (PRELOADED_DUCK) {
  activeDuck = PRELOADED_DUCK;
  resetDuckUI();
} else if (duckSelect) {
  fetch("https://api.ducks.ects-cmp.com/ducks")
    .then((resp) => resp.json())
    .then((data) => {
      for (let d of data) {
        const option = document.createElement("option");
        option.innerHTML = `
                        ${d.name} (${d.assembler})
                        `;
        option.value = d._id;
        option.duck = d;
        duckSelect.append(option);
      }
    });

  duckSelect.addEventListener("change", async function () {
    //console.log(this.value);
    activeDuck = duckSelect.options[duckSelect.selectedIndex].duck;
    console.log(activeDuck);
    resetDuckUI();
  });
}
async function resetDuckUI() {
  await loadDuck(activeDuck);
  const prompt = document.getElementById("duck_select_prompt");
  if (prompt) prompt.style.display = "none";
  document.getElementById("name_row").style.display = "";
  document.getElementById("assembler_row").style.display = "";
  document.getElementById("chat_section").style.display = "block";
  duckReadyName.textContent = activeDuck.name;
  document.getElementById("duckChatSubtitle").textContent =
    `Start a conversation with ${activeDuck.name}`;
  document.getElementById("startChatDiv").style.display = "flex";
  chatBody.style.display = "none";
  chatMessages.innerHTML = "";
  conversation = [];
  document.querySelector(".duck-chat-status").classList.remove("online");
  chatCollapse.classList.add("duck-chat-open");
  chatChevron.classList.add("open");
  if (SINGLE_DUCK_MODE) {
    document.getElementById("startChatDiv").style.display = "none";
    await startDuckChat();
  }
}

chatToggle.addEventListener("click", function () {
  const isOpen = chatCollapse.classList.toggle("duck-chat-open");
  chatChevron.classList.toggle("open", isOpen);
});

async function loadDuck(duck) {
  document.getElementById("ThreeDuck").classList.add("waiting");
  const duckImg = document.getElementById("loading_img");
  duckImg.src = "/images/Microwave_Duck.gif";
  duckImg.classList.add("microwave");
  let stat_labels = ["strength", "focus", "health", "intelligence", "kindness"];
  let row_labels = ["id", "name", "assembler", "adjectives", "bio"];
  for (let stat of stat_labels) {
    let elem = document.getElementById(`${stat}_bar`);
    displayStat(elem, duck.stats[stat]);
  }
  for (let row of row_labels) {
    let elem = document.getElementById(`${row}_row`);
    if (row === "id") {
      displayDuckIdLink(elem, duck._id);
    } else {
      displayAttribute(elem, duck[row]);
    }
  }

  await viewer.showDuck(duck);
  document.getElementById("ThreeDuck").classList.remove("waiting");
  document.getElementById("chat_section").style.display = "block";
}

function displayAttribute(element, value) {
  const span = element.querySelector(".stat_val_span");
  if (element.id === "adjectives_row") {
    const adjectives = Array.isArray(value)
      ? value
      : String(value)
          .split(",")
          .map((s) => s.trim());
    span.innerHTML = adjectives
      .map((adj) => `<span class="adjective-badge">${adj}</span>`)
      .join("");
  } else {
    span.innerHTML = value;
  }
}

function displayStat(element, value) {
  element.querySelector(".progress-bar").style =
    `width: ${value * STAT_MULTIPLIER}%`;
  element.querySelector(".stat_val_span").innerHTML = value;
}

function displayDuckIdLink(element, duckId) {
  const span = element.querySelector(".stat_val_span");
  const shareUrl = `${window.location.origin}/duck/${duckId}`;

  span.innerHTML = `<a href="${shareUrl}">${duckId}</a>`;
}

startChatBtn.addEventListener("click", async function () {
  document.getElementById("startChatDiv").style.display = "none";
  await startDuckChat(activeDuck);
});

async function startDuckChat(duck) {
  chatBody.style.display = "block";
  document.querySelector(".duck-chat-status").classList.add("online");
  conversation.push({
    role: "user",
    content:
      "Introduce yourself as this duck. Mention your personality naturally based on your traits, and keep it fun.",
  });
  await streamDuckReply();
}

async function streamDuckReply() {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        duck: activeDuck,
        messages: conversation,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      appendMessage("duck", `Error: ${errorText}`);
      return;
    }

    const duckMessageElements = appendStreamingMessage("duck");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullReply = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullReply += chunk;

      duckMessageElements.textSpan.innerHTML = formatMessage(fullReply);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    conversation.push({
      role: "assistant",
      content: fullReply,
    });
  } catch (err) {
    console.error(err);
    appendMessage("duck", "Quack... something went wrong while I was talking.");
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function formatMessage(text) {
  const parts = [];
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = codeBlockRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', lang: match[1] || '', content: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return parts.map(p => {
    if (p.type === 'code') {
      const langLabel = p.lang ? `<span class="chat-code-lang">${escapeHtml(p.lang)}</span>` : '<span></span>';
      return `<div class="chat-code-block"><div class="chat-code-header">${langLabel}<button class="chat-copy-btn">Copy</button></div><pre><code>${escapeHtml(p.content)}</code></pre></div>`;
    }
    let html = escapeHtml(p.content);
    html = html.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }).join('');
}

function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;

  const sender = document.createElement("div");
  sender.className = "chat-sender";
  sender.textContent = role === "user" ? "You" : activeDuck.name;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  if (role === "duck") {
    bubble.innerHTML = formatMessage(text);
  } else {
    bubble.textContent = text;
  }

  wrapper.append(sender, bubble);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendStreamingMessage(role) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;

  const sender = document.createElement("div");
  sender.className = "chat-sender";
  sender.textContent = activeDuck.name;

  const textSpan = document.createElement("div");
  textSpan.className = "chat-bubble";
  textSpan.textContent = "";

  wrapper.append(sender, textSpan);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return { wrapper, textSpan };
}

chatMessages.addEventListener("click", function (e) {
  const btn = e.target.closest(".chat-copy-btn");
  if (!btn) return;
  const code = btn.closest(".chat-code-block").querySelector("code").textContent;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "Copy";
      btn.classList.remove("copied");
    }, 2000);
  });
});

chatForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  if (!activeDuck) return;
  const text = chatInput.value.trim();
  if (!text) return;
  appendMessage("user", text);
  conversation.push({
    role: "user",
    content: text,
  });
  chatInput.value = "";
  await streamDuckReply();
});

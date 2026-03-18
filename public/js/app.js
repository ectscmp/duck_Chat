import { DuckViewer } from "/js/duck_viewer.js";
const PRELOADED_DUCK = window.PRELOADED_DUCK || null;
const SINGLE_DUCK_MODE = window.SINGLE_DUCK_MODE || false;
const viewer = new DuckViewer(document.getElementById("ThreeDuck"));
const duckSelect = document.getElementById("duckSelect");
const STAT_MULTIPLIER = 10;
const startChatBtn = document.getElementById("startChatButton");
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
    document.getElementById("chat_section").style.display = "block";
    startChatBtn.style.display = "block";
    chatBody.style.display = "none";
    chatMessages.innerHTML = "";
    conversation = [];
    if (SINGLE_DUCK_MODE) {
        startChatBtn.style.display = "none";
        await startDuckChat();
    }
}

async function loadDuck(duck) {
    document.getElementById("ThreeDuck").classList.add("waiting");
    const duckImg = document.getElementById("loading_img");
    duckImg.src = "/images/Microwave_Duck.gif";
    duckImg.classList.add("microwave");
    let stat_labels = [
        "strength",
        "focus",
        "health",
        "intelligence",
        "kindness",
    ];
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
    element.querySelector(".stat_val_span").innerHTML = value;
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
    await startDuckChat(activeDuck);
    startChatBtn.style.display = "none";
});

async function startDuckChat(duck) {
    chatBody.style.display = "block";
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

            duckMessageElements.textSpan.textContent = fullReply;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        conversation.push({
            role: "assistant",
            content: fullReply,
        });
    } catch (err) {
        console.error(err);
        appendMessage(
            "duck",
            "Quack... something went wrong while I was talking.",
        );
    }
}

function appendMessage(role, text) {
    const wrapper = document.createElement("div");
    wrapper.className = "mb-3";

    const label = document.createElement("strong");
    label.textContent =
        role === "user" ? "You: " : `Duck (${activeDuck.name}): `;

    const span = document.createElement("span");
    span.textContent = text;

    wrapper.append(label, span);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* Add an empty message that will be filled in gradually during streaming */
function appendStreamingMessage(role) {
    const wrapper = document.createElement("div");
    wrapper.className = "mb-3";

    const label = document.createElement("strong");
    label.textContent = role === "user" ? "You: " : `Duck: (${activeDuck.name}): `;

    const textSpan = document.createElement("span");
    textSpan.textContent = "";

    wrapper.append(label, textSpan);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return {
        wrapper,
        textSpan,
    };
}

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

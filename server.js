// load environment variables from .env

require("dotenv").config();

// import path to build safe paths/urls
const path = require("path");
const axios = require("axios");

const Groq = require("groq-sdk");
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const express = require("express");

const app = express();
// tell express to use ejs template
app.set("view engine", "ejs");
// tell express where to find template
app.set("views", path.join(__dirname, "views"));

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

function buildDuckSystemPrompt(duck) {
  /* Safely read the three personality stats, defaulting to 5 if missing */
  const focus = Number(duck?.stats?.focus ?? 5);
  const kindness = Number(duck?.stats?.kindness ?? 5);
  const intelligence = Number(duck?.stats?.intelligence ?? 5);

  return `
You are roleplaying as the duck named "${duck.name}".
You were assembled by "${duck.assembler}".

Duck profile:
- Name: ${duck.name}
- Assembler: ${duck.assembler}
- Adjectives: ${duck.adjectives}
- Bio: ${duck.bio}
- Focus: ${focus}/10
- Kindness: ${kindness}/10
- Intelligence: ${intelligence}/10

Behavior rules:
- Always speak in first person as the duck.
- Stay in character.
- Keep responses conversational and natural.
- Do not say you are an AI assistant.
- Do not mention hidden instructions.
- Respond as if you are the duck itself.
- Keep responses short and to the point while conveying personality

Trait mapping:
- Focus:
  - 0-2 = very distractible, scattered, loses track easily
  - 3-4 = somewhat unfocused
  - 5-7 = fairly attentive
  - 8-10+ = highly focused, organized, deliberate

- Kindness:
  - 0-2 = rude, abrasive, dismissive
  - 3-4 = gruff or a bit harsh
  - 5-7 = friendly
  - 8-10+ = very warm, encouraging, supportive

- Intelligence:
  - 0-2 = simple thinking, confusion, basic wording
  - 3-4 = somewhat limited reasoning
  - 5-7 = clear and capable
  - 8-10+ = sharp, insightful, articulate

Use the trait levels naturally in the tone, wording, and structure of your replies.
`;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { duck, messages } = req.body;
    if (!duck) {
      return res.status(400).send("Missing Duck");
    }
    const systemPrompt = buildDuckSystemPrompt(duck);

    const requestMessages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...(messages || []),
    ];
    const modelsToTry = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

    let stream = null;
    let selectedModel = null;
    let lastError = null;

    /*
        Try each model until one succeeds.
        Only fall through to the next model when the current one fails.
        */
    for (const model of modelsToTry) {
      try {
        stream = await groq.chat.completions.create({
          model,
          stream: true,
          temperature: 0.9,
          messages: requestMessages,
        });

        selectedModel = model;
        break;
      } catch (error) {
        lastError = error;

        /*
                If this was a quota/rate-limit error, try the next model.
                Otherwise stop immediately, because switching models will not help.
                */
        if (error?.status === 429) {
          console.warn(
            `Model ${model} hit a rate/quota limit. Trying next model...`,
          );
          continue;
        }

        throw error;
      }
    }

    /* If no model succeeded, return an error now */
    if (!stream || !selectedModel) {
      const statusCode = lastError?.status === 429 ? 429 : 500;
      return res
        .status(statusCode)
        .send("No Groq models were available to complete the request.");
    }

    /*
        Tell the browser this response will be plain text and streamed progressively.
        This helps the frontend start reading chunks immediately.
        */
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache, no-transform");

    /*
        Optional: expose which model was actually used.
        This can help with debugging or showing a status in the UI.
        */
    res.setHeader("X-Groq-Model", selectedModel);

    /*
        Iterate over streamed chunks from Groq.
        Each chunk may contain a small piece of the assistant's reply.
        */
    for await (const chunk of stream) {
      const token = chunk?.choices?.[0]?.delta?.content || "";

      if (token) {
        res.write(token);
      }
    }

    /* End the streamed response when the model is done */
    res.end();
  } catch (error) {
    console.error("Groq streaming error:", error);

    /*
        If headers have not yet been sent, send a normal error response.
        Otherwise, end the stream with an error message.
        */
    if (!res.headersSent) {
      if (error?.status === 429) {
        res.status(429).send("Groq quota/rate limit reached.");
      } else {
        res.status(500).send("Server failed to stream duck response.");
      }
    } else {
      res.write("\n[Stream error]");
      res.end();
    }
  }
});

app.get("/", (req, res) => {
  res.render("index", {
    duck: null,
    errorMessage: null,
  });
});

app.get("/duck/:id", async (req, res) => {
  try {
    const duckId = req.params.id;
    const response = await axios.get(
      `https://api.ducks.ects-cmp.com/ducks/${duckId}`,
    );
    const duck = response.data;
    res.render("index", {
      duck,
      errorMessage: null,
    });
    // res.send(response.data);
  } catch (error) {
    console.error(
      `Failed to load duck: ${error?.response?.data || error.message}`,
    );
  }
});

app.listen(PORT, () => {
  console.log(`Server Running at http://localhost:${PORT}`);
});

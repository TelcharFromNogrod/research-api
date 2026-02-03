import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

// Initialize Groq client (free tier: Llama 3.1 70B)
// TODO: Upgrade to Claude/GPT-4 for better quality when budget allows
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ""
});

const app = express();
app.use(express.json());

// ============================================
// FREE ENDPOINTS (before payment middleware)
// ============================================

// Health check (free - defined before payment middleware)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "OpenClaw Research API",
    version: "1.1.0",
    aiModel: "llama-3.3-70b-versatile (Groq)",
    timestamp: new Date().toISOString(),
    network: "eip155:8453",
    endpoints: [
      { path: "/research", method: "POST", price: "$0.02", description: "AI-powered research" },
      { path: "/summarize", method: "POST", price: "$0.01", description: "Text summarization" }
    ]
  });
});

// Your receiving wallet address - CHANGE THIS!
const payTo = process.env.PAY_TO_ADDRESS || "0x0000000000000000000000000000000000000000";

// Create facilitator client (testnet for now)
const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL || "https://x402.org/facilitator"
});

// Create resource server and register EVM scheme
const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453", new ExactEvmScheme());  // Base mainnet

// Configure payment middleware for our endpoints
app.use(
  paymentMiddleware(
    {
      "POST /research": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.02", // 2 cents per research query
            network: "eip155:8453", // Base mainnet
            payTo,
          },
        ],
        description: "AI-powered research assistant. Submit a question or topic and get structured research with key insights.",
        mimeType: "application/json",
        extensions: {
          bazaar: {
            discoverable: true,
            category: "research",
            tags: ["ai", "research", "analysis", "insights"],
            info: {
              input: {
                method: "POST",
                bodyType: "json",
                bodyFields: {
                  query: {
                    type: "string",
                    required: true,
                    description: "Research question or topic (2-500 characters)"
                  },
                  depth: {
                    type: "string",
                    required: false,
                    description: "Research depth: 'quick' (default), 'standard', or 'deep'"
                  }
                }
              },
              output: {
                example: {
                  success: true,
                  query: "What is x402?",
                  summary: "x402 is an open payment protocol...",
                  keyPoints: ["Point 1", "Point 2"],
                  insights: "Based on the research...",
                  confidence: 0.85,
                  processingTimeMs: 1234
                }
              }
            }
          }
        }
      },
      "POST /summarize": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01", // 1 cent per summary
            network: "eip155:8453",
            payTo,
          },
        ],
        description: "Summarize any text into key points and a concise overview.",
        mimeType: "application/json",
        extensions: {
          bazaar: {
            discoverable: true,
            category: "text",
            tags: ["ai", "summarization", "text", "analysis"],
            info: {
              input: {
                method: "POST",
                bodyType: "json",
                bodyFields: {
                  text: {
                    type: "string",
                    required: true,
                    description: "Text to summarize (100-10000 characters)"
                  },
                  style: {
                    type: "string",
                    required: false,
                    description: "Summary style: 'bullet' (default), 'paragraph', 'executive'"
                  }
                }
              },
              output: {
                example: {
                  success: true,
                  summary: "Main summary...",
                  keyPoints: ["Key point 1", "Key point 2"],
                  wordCount: {
                    original: 1500,
                    summary: 150
                  }
                }
              }
            }
          }
        }
      },
    },
    server,
  ),
);

// ============================================
// PAID ROUTE HANDLERS (after payment middleware)
// ============================================

// Research endpoint
app.post("/research", async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { query, depth = "quick" } = req.body;

    // Validate input
    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'query' parameter"
      });
    }

    if (query.length < 2 || query.length > 500) {
      return res.status(400).json({
        success: false,
        error: "Query must be between 2-500 characters"
      });
    }

    // Simulate AI research (in production, this would call an LLM)
    const research = await performResearch(query, depth);
    
    res.json({
      success: true,
      query: query,
      depth: depth,
      ...research,
      processingTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error("Research error:", error);
    res.status(500).json({
      success: false,
      error: "Research processing failed",
      processingTimeMs: Date.now() - startTime
    });
  }
});

// Summarize endpoint  
app.post("/summarize", async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { text, style = "bullet" } = req.body;

    // Validate input
    if (!text || typeof text !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'text' parameter"
      });
    }

    if (text.length < 100 || text.length > 10000) {
      return res.status(400).json({
        success: false,
        error: "Text must be between 100-10000 characters"
      });
    }

    // Simulate AI summarization
    const summary = await performSummarization(text, style);
    
    res.json({
      success: true,
      style: style,
      ...summary,
      wordCount: {
        original: text.split(/\s+/).length,
        summary: summary.summary.split(/\s+/).length
      },
      processingTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error("Summarization error:", error);
    res.status(500).json({
      success: false,
      error: "Summarization processing failed",
      processingTimeMs: Date.now() - startTime
    });
  }
});

// ============================================
// AI FUNCTIONS (Groq/Llama 3.1 70B - free tier)
// TODO: Upgrade to Claude/GPT-4 for better quality when budget allows
// ============================================

async function performResearch(query, depth) {
  const maxTokens = depth === "deep" ? 2000 : depth === "standard" ? 1200 : 800;
  
  const systemPrompt = `You are a research assistant. Analyze the query and provide structured research findings.
Return a JSON object with these fields:
- summary: A concise summary of your findings (2-4 sentences)
- keyPoints: Array of 3-5 key insights as strings
- insights: Actionable recommendations or deeper analysis (1-2 sentences)
- relatedTopics: Array of 3-5 related topics to explore
- confidence: A number 0.0-1.0 indicating how confident you are in the findings

Respond ONLY with valid JSON, no markdown or explanation.`;

  const userPrompt = `Research query: "${query}"
Depth: ${depth}

Provide comprehensive research findings.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const response = JSON.parse(completion.choices[0].message.content);
    return {
      summary: response.summary || "Research completed.",
      keyPoints: response.keyPoints || [],
      insights: response.insights || "",
      relatedTopics: response.relatedTopics || [],
      confidence: response.confidence || 0.8,
      model: "llama-3.3-70b-versatile"
    };
  } catch (error) {
    console.error("Groq API error:", error);
    // Fallback response if API fails
    return {
      summary: `Research on "${query}" could not be completed due to an API error.`,
      keyPoints: ["API temporarily unavailable"],
      insights: "Please try again later.",
      relatedTopics: [],
      confidence: 0.0,
      error: "AI service temporarily unavailable"
    };
  }
}

async function performSummarization(text, style) {
  const styleInstructions = {
    bullet: "Format the summary as bullet points (• prefix each point)",
    paragraph: "Write as flowing paragraphs",
    executive: "Write a formal executive summary with key takeaways"
  };

  const systemPrompt = `You are a text summarization assistant.
Summarize the provided text in the requested style.
Return a JSON object with these fields:
- summary: The summarized text in the requested style
- keyPoints: Array of 3-5 main takeaways as strings
- sentenceCount: Number of sentences in the original text

Respond ONLY with valid JSON, no markdown or explanation.`;

  const userPrompt = `Text to summarize:
"""
${text.substring(0, 8000)}
"""

Style: ${style}
Instructions: ${styleInstructions[style] || styleInstructions.bullet}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const response = JSON.parse(completion.choices[0].message.content);
    return {
      summary: response.summary || "Summary unavailable.",
      keyPoints: response.keyPoints || [],
      sentenceCount: response.sentenceCount || text.split(/[.!?]+/).length,
      model: "llama-3.3-70b-versatile"
    };
  } catch (error) {
    console.error("Groq API error:", error);
    // Fallback to simple extraction
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return {
      summary: sentences.slice(0, 3).join(" "),
      keyPoints: sentences.slice(0, 5).map(s => s.trim().substring(0, 100)),
      sentenceCount: sentences.length,
      error: "AI service temporarily unavailable - basic extraction used"
    };
  }
}

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 4021;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          🔬 OpenClaw Research API v1.1.0 🔬               ║
╠═══════════════════════════════════════════════════════════╣
║  x402 Payment-Enabled Research Service                    ║
║  Powered by Llama 3.1 70B (Groq)                          ║
║                                                           ║
║  Endpoints:                                               ║
║  • POST /research  - AI research ($0.02/query)            ║
║  • POST /summarize - Text summarization ($0.01/query)     ║
║  • GET  /health    - Health check (free)                  ║
║                                                           ║
║  Server: http://localhost:${PORT}                           ║
║  Network: Base mainnet (eip155:8453)                     ║
║  Pay To: ${payTo.substring(0, 10)}...${payTo.substring(34)}                  ║
║                                                           ║
║  NOTE: Upgrade to Claude/GPT-4 when budget allows         ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;

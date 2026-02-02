import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import dotenv from "dotenv";

dotenv.config();

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
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    network: "eip155:84532",
    endpoints: [
      { path: "/research", method: "POST", price: "$0.005", description: "AI-powered research" },
      { path: "/summarize", method: "POST", price: "$0.003", description: "Text summarization" }
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
  .register("eip155:84532", new ExactEvmScheme())  // Base Sepolia testnet
  .register("eip155:8453", new ExactEvmScheme());  // Base mainnet

// Configure payment middleware for our endpoints
app.use(
  paymentMiddleware(
    {
      "POST /research": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.005", // 0.5 cents per research query
            network: "eip155:84532", // Base Sepolia for testing
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
            price: "$0.003", // 0.3 cents per summary
            network: "eip155:84532",
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
// AI FUNCTIONS (placeholder - would use real LLM)
// ============================================

async function performResearch(query, depth) {
  // In production, this would call Claude/GPT/etc.
  // For now, return structured placeholder demonstrating the format
  
  const depthMultiplier = depth === "deep" ? 3 : depth === "standard" ? 2 : 1;
  
  // Simulate processing time based on depth
  await new Promise(r => setTimeout(r, 100 * depthMultiplier));
  
  return {
    summary: `Research findings for: "${query}". This is a demonstration response. In production, this endpoint would use AI to provide comprehensive research on any topic, synthesizing information and providing actionable insights.`,
    keyPoints: [
      "AI-powered research provides faster insights than manual searching",
      "Structured output makes integration with other AI agents seamless",
      "x402 protocol enables micropayments for each query",
      `Query depth '${depth}' affects comprehensiveness of results`
    ],
    insights: `Based on analyzing "${query}", we recommend further investigation into related areas. The x402 protocol makes this kind of on-demand research economically viable for AI agents.`,
    relatedTopics: [
      "x402 protocol",
      "AI agents",
      "micropayments",
      "automated research"
    ],
    confidence: 0.75 + (Math.random() * 0.2),
    sources: [
      { type: "web", count: 5 * depthMultiplier },
      { type: "academic", count: 2 * depthMultiplier }
    ]
  };
}

async function performSummarization(text, style) {
  // In production, this would call an LLM
  await new Promise(r => setTimeout(r, 50));
  
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const keyPoints = sentences.slice(0, Math.min(5, sentences.length))
    .map(s => s.trim().substring(0, 100) + (s.length > 100 ? "..." : ""));
  
  let summary;
  if (style === "executive") {
    summary = `Executive Summary: ${keyPoints[0]} This document covers ${sentences.length} key points across the provided text.`;
  } else if (style === "paragraph") {
    summary = keyPoints.join(" ");
  } else {
    summary = keyPoints.map((p, i) => `• ${p}`).join("\n");
  }
  
  return {
    summary,
    keyPoints,
    sentenceCount: sentences.length
  };
}

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 4021;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          🔬 OpenClaw Research API v1.0.0 🔬               ║
╠═══════════════════════════════════════════════════════════╣
║  x402 Payment-Enabled Research Service                    ║
║                                                           ║
║  Endpoints:                                               ║
║  • POST /research  - AI research ($0.005/query)           ║
║  • POST /summarize - Text summarization ($0.003/query)    ║
║  • GET  /health    - Health check (free)                  ║
║                                                           ║
║  Server: http://localhost:${PORT}                           ║
║  Network: Base Sepolia (eip155:84532)                     ║
║  Pay To: ${payTo.substring(0, 10)}...${payTo.substring(34)}                  ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;

import express from "express";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ""
});

const app = express();
app.use(express.json());

// Configuration
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://facilitator.x402.rs";
const PAY_TO = process.env.PAY_TO_ADDRESS || "0xab70558cd349229FbF03f5E3C50F99Df65969e5c";

// USDC contract on Base mainnet
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Prices in USDC (6 decimals) - $0.02 = 20000, $0.01 = 10000
const PRICES = {
  research: "20000",
  summarize: "10000"
};

// ============================================
// FREE ENDPOINTS
// ============================================

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "OpenClaw Research API",
    version: "1.2.0",
    protocol: "x402 v1",
    aiModel: "llama-3.3-70b-versatile (Groq)",
    facilitator: FACILITATOR_URL,
    timestamp: new Date().toISOString(),
    network: "base",
    endpoints: [
      { path: "/research", method: "POST", price: "$0.02", description: "AI-powered research" },
      { path: "/summarize", method: "POST", price: "$0.01", description: "Text summarization" }
    ]
  });
});

// ============================================
// x402 v1 PAYMENT MIDDLEWARE
// ============================================

function createPaymentRequired(endpoint, price, description) {
  return {
    x402Version: 1,
    accepts: [{
      scheme: "exact",
      network: "base",
      maxAmountRequired: price,
      resource: `${process.env.BASE_URL || 'https://research-api-production-7eca.up.railway.app'}${endpoint}`,
      description: description,
      mimeType: "application/json",
      payTo: PAY_TO,
      asset: USDC_BASE,
      extra: {
        name: "USDC",
        version: "2"
      }
    }],
    error: "Payment required"
  };
}

async function verifyPayment(paymentHeader, endpoint, price) {
  try {
    // Decode the payment from base64
    const paymentData = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
    
    // Verify with facilitator
    const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment: paymentData,
        details: {
          scheme: "exact",
          network: "base",
          maxAmountRequired: price,
          resource: `${process.env.BASE_URL || 'https://research-api-production-7eca.up.railway.app'}${endpoint}`,
          payTo: PAY_TO,
          asset: USDC_BASE,
          extra: { name: "USDC", version: "2" }
        }
      })
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.text();
      console.error("Facilitator verify error:", error);
      return { valid: false, error };
    }

    const result = await verifyResponse.json();
    return { valid: result.valid !== false, result };
  } catch (error) {
    console.error("Payment verification error:", error);
    return { valid: false, error: error.message };
  }
}

async function settlePayment(paymentHeader, endpoint, price) {
  try {
    const paymentData = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
    
    const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment: paymentData,
        details: {
          scheme: "exact",
          network: "base",
          maxAmountRequired: price,
          resource: `${process.env.BASE_URL || 'https://research-api-production-7eca.up.railway.app'}${endpoint}`,
          payTo: PAY_TO,
          asset: USDC_BASE,
          extra: { name: "USDC", version: "2" }
        }
      })
    });

    if (!settleResponse.ok) {
      const error = await settleResponse.text();
      console.error("Facilitator settle error:", error);
      return { success: false, error };
    }

    const result = await settleResponse.json();
    return { success: true, result };
  } catch (error) {
    console.error("Payment settlement error:", error);
    return { success: false, error: error.message };
  }
}

function x402Middleware(endpoint, price, description) {
  return async (req, res, next) => {
    const paymentHeader = req.headers["x-payment"];
    
    if (!paymentHeader) {
      // Return 402 Payment Required
      return res.status(402).json(createPaymentRequired(endpoint, price, description));
    }

    // Verify the payment
    const verification = await verifyPayment(paymentHeader, endpoint, price);
    
    if (!verification.valid) {
      return res.status(402).json({
        ...createPaymentRequired(endpoint, price, description),
        verificationError: verification.error
      });
    }

    // Store payment for settlement after response
    req.x402Payment = { paymentHeader, endpoint, price };
    
    // Override res.json to settle payment after successful response
    const originalJson = res.json.bind(res);
    res.json = async (data) => {
      // Settle payment
      const settlement = await settlePayment(paymentHeader, endpoint, price);
      
      if (settlement.success && settlement.result?.txHash) {
        res.setHeader("X-Payment-Response", JSON.stringify({
          success: true,
          txHash: settlement.result.txHash
        }));
      }
      
      return originalJson(data);
    };
    
    next();
  };
}

// ============================================
// PAID ENDPOINTS
// ============================================

app.post("/research", 
  x402Middleware("/research", PRICES.research, "AI-powered research assistant"),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { query, depth = "quick" } = req.body;
      
      if (!query || query.length < 2 || query.length > 500) {
        return res.status(400).json({
          success: false,
          error: "Query must be between 2 and 500 characters"
        });
      }

      const result = await performResearch(query, depth);
      
      res.json({
        success: true,
        query,
        depth,
        ...result,
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
  }
);

app.post("/summarize",
  x402Middleware("/summarize", PRICES.summarize, "Text summarization service"),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { text, style = "bullet" } = req.body;
      
      if (!text || text.length < 100 || text.length > 10000) {
        return res.status(400).json({
          success: false,
          error: "Text must be between 100 and 10000 characters"
        });
      }

      const result = await performSummarization(text, style);
      
      res.json({
        success: true,
        style,
        ...result,
        wordCount: {
          original: text.split(/\s+/).length,
          summary: result.summary.split(/\s+/).length
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
  }
);

// ============================================
// AI FUNCTIONS
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

  const userPrompt = `Research query: "${query}"\nDepth: ${depth}\n\nProvide comprehensive research findings.`;

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

  const userPrompt = `Text to summarize:\n"""\n${text.substring(0, 8000)}\n"""\n\nStyle: ${style}\nInstructions: ${styleInstructions[style] || styleInstructions.bullet}`;

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
║         🔬 OpenClaw Research API v1.2.0 🔬                ║
║           x402 v1 Payment-Enabled Service                 ║
╠═══════════════════════════════════════════════════════════╣
║  Powered by Llama 3.3 70B (Groq)                          ║
║  Facilitator: ${FACILITATOR_URL.padEnd(38)}║
║                                                           ║
║  Server: http://localhost:${PORT}                            ║
║  Network: Base mainnet (decentralized via x402.rs)        ║
║  Pay To: ${PAY_TO.substring(0, 10)}...${PAY_TO.substring(38)}                         ║
║                                                           ║
║  Endpoints:                                               ║
║  • POST /research   - AI research ($0.02/query)           ║
║  • POST /summarize  - Text summarization ($0.01/query)    ║
║  • GET  /health     - Health check (free)                 ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
